import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { SpeakerHigh, SpeakerSlash, CaretRight, CaretLeft, SignOut, Warning, Tag, ImageBroken } from '@phosphor-icons/react';
import { InteractionLayer } from '@/components/InteractionLayer';
import { FeedbackModal } from '@/components/FeedbackModal';
import { useSession } from '@/hooks/useSession';
import { useTelemetry } from '@/hooks/useTelemetry';
import { useTTS } from '@/hooks/useTTS';
import type { Draft, FeedbackStatus } from '@/types/story';

export default function ReaderPage() {
  const navigate = useNavigate();
  const { session, clear: clearSession } = useSession();
  const { track, flush } = useTelemetry(session?.session_id ?? null, session?.story_id ?? null);
  const tts = useTTS();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [pageIdx, setPageIdx] = useState(0);
  const [feedback, setFeedback] = useState<FeedbackStatus | null>(null);
  const [imgStatus, setImgStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const enterRef = useRef(Date.now());
  const trackedRef = useRef(false);

  useEffect(() => {
    try {
      const s = localStorage.getItem('storybook_draft');
      if (!s) { navigate('/'); return; }
      setDraft(JSON.parse(s));
    } catch { navigate('/'); }
  }, [navigate]);

  // 换页时重置图片状态
  useEffect(() => { setImgStatus('loading'); }, [pageIdx]);

  // track page_view
  useEffect(() => {
    if (!draft || !session) return;
    const p = draft.pages[pageIdx];
    if (!p || trackedRef.current) return;
    track('page_view', { behavior_anchor: p.behavior_anchor }, p.page_id);
    trackedRef.current = true;
    enterRef.current = Date.now();
    tts.stop();
    return () => { trackedRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIdx, draft, session]);

  const trackDwell = useCallback(() => {
    if (!draft || !session) return;
    const p = draft.pages[pageIdx];
    if (!p) return;
    track('page_dwell', { duration_ms: Date.now() - enterRef.current }, p.page_id);
  }, [draft, session, pageIdx, track]);

  const goTo = useCallback((next: number) => {
    if (!draft) return;
    trackDwell();
    if (next >= draft.pages.length) {
      track('story_complete', { completion_rate: 1.0 }, draft.pages[draft.pages.length - 1].page_id);
      flush();
      setFeedback('COMPLETED');
      return;
    }
    setPageIdx(next);
  }, [draft, trackDwell, track, flush]);

  const onInteraction = useCallback((key: string, ms: number) => {
    if (!draft) return;
    track('interaction', { event_key: key, latency_ms: ms }, draft.pages[pageIdx].page_id);
  }, [draft, pageIdx, track]);

  const onBranch = useCallback((choiceId: string, nextPageId: string) => {
    if (!draft) return;
    track('branch_select', { choice_id: choiceId }, draft.pages[pageIdx].page_id);
    const idx = draft.pages.findIndex(p => p.page_id === nextPageId);
    if (idx >= 0) { trackDwell(); setPageIdx(idx); }
  }, [draft, pageIdx, track, trackDwell]);

  const onTTS = useCallback(() => {
    if (!draft) return;
    const p = draft.pages[pageIdx];
    if (tts.isSpeaking) { tts.stop(); track('read_aloud_play', { enabled: false, page_id: p.page_id }, p.page_id); }
    else { tts.speak(p.text); track('read_aloud_play', { enabled: true, page_id: p.page_id }, p.page_id); }
  }, [draft, pageIdx, tts, track]);

  const onExit = useCallback(() => { trackDwell(); flush(); setFeedback('ABORTED'); }, [trackDwell, flush]);

  const onFeedbackDone = useCallback(() => {
    clearSession();
    localStorage.removeItem('storybook_draft');
    navigate('/');
  }, [clearSession, navigate]);

  if (!draft || !session) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-[var(--color-accent)]/30 border-t-[var(--color-accent)] rounded-full animate-spin" />
    </div>
  );

  const page = draft.pages[pageIdx];
  const isLast = pageIdx === draft.pages.length - 1;
  const isFirst = pageIdx === 0;
  const progress = ((pageIdx + 1) / draft.pages.length) * 100;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[var(--color-background)]">

      {/* ── 顶部通栏 ── */}
      <header className="relative flex items-center justify-between h-11 px-6 flex-shrink-0 bg-[var(--color-surface)]/90 backdrop-blur-sm border-b border-[var(--color-border-light)] z-20">
        {/* 退出 */}
        <button onClick={onExit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--color-muted)] hover:bg-[var(--color-warm-100)] active:scale-[0.98] transition-colors">
          <SignOut size={14} weight="bold" />Exit
        </button>

        {/* 进度条 + 页码（绝对居中） */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-3">
          <div className="w-40 h-1 bg-[var(--color-warm-100)] rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-[var(--color-accent)] rounded-full"
              animate={{ width: `${progress}%` }}
              transition={{ type: 'spring', stiffness: 100, damping: 20 }}
            />
          </div>
          <span className="text-xs font-mono text-[var(--color-muted)]">{pageIdx + 1} / {draft.pages.length}</span>
        </div>

        {/* TTS */}
        {tts.isSupported ? (
          <button onClick={onTTS}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium active:scale-[0.98] transition-colors
              ${tts.isSpeaking ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]' : 'text-[var(--color-muted)] hover:bg-[var(--color-warm-100)]'}`}>
            {tts.isSpeaking ? <SpeakerHigh size={14} weight="fill" /> : <SpeakerSlash size={14} weight="light" />}
            {tts.isSpeaking ? 'Speaking' : 'Read aloud'}
          </button>
        ) : (
          <span className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
            <Warning size={12} weight="fill" />TTS unavailable
          </span>
        )}
      </header>

      {/* ── 主区域：左图 + 右文 ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* 左栏 58%：插图 */}
        <div className="relative w-[58%] flex-shrink-0 bg-[var(--color-warm-100)]">
          <AnimatePresence mode="wait">
            <motion.div
              key={page.page_id + '-img'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="absolute inset-0"
            >
              {/* 骨架屏 */}
              {imgStatus === 'loading' && (
                <div className="absolute inset-0 skeleton-shimmer" />
              )}
              {/* 加载失败 */}
              {imgStatus === 'error' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-[var(--color-muted)] gap-3">
                  <ImageBroken size={56} weight="light" />
                  <p className="text-sm">Illustration unavailable</p>
                </div>
              )}
              {/* 图片（有 imageUrl 时渲染） */}
              {page.image_prompt && (
                <img
                  src={undefined}
                  alt={`Page ${page.page_no}`}
                  className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${imgStatus === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
                  onLoad={() => setImgStatus('loaded')}
                  onError={() => setImgStatus('error')}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 右栏 42%：文字 + 互动 + 导航 */}
        <div className="w-[42%] flex flex-col overflow-hidden border-l border-[var(--color-border-light)]">

          {/* 可滚动内容区 */}
          <div className="flex-1 overflow-y-auto px-10 py-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={page.page_id}
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                transition={{ type: 'spring', stiffness: 200, damping: 25 }}
              >
                {/* 故事文字 */}
                <p className="text-2xl leading-loose text-[var(--color-foreground)]">
                  {page.text}
                </p>
                <div className="mt-4 flex items-center gap-1.5 text-sm text-[var(--color-muted)]">
                  <Tag size={14} weight="bold" />
                  <span>{page.behavior_anchor}</span>
                </div>

                {/* 互动层 */}
                <InteractionLayer
                  interaction={page.interaction}
                  branchChoices={page.branch_choices}
                  onInteractionComplete={onInteraction}
                  onBranchSelect={onBranch}
                />

                {/* 最后一页：正反馈区 */}
                {isLast && (
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, type: 'spring', stiffness: 100, damping: 20 }}
                    className="mt-6 bg-[var(--color-accent-light)] rounded-2xl border border-[var(--color-accent)]/20 p-5"
                  >
                    <p className="text-sm font-medium text-[var(--color-accent)]">{draft.ending.positive_feedback}</p>
                    <p className="text-xs text-[var(--color-muted)] mt-2">Next goal: {draft.ending.next_micro_goal}</p>
                  </motion.div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* 底部导航（固定） */}
          <div className="flex-shrink-0 flex items-center gap-3 px-10 py-6 border-t border-[var(--color-border-light)]">
            <button
              onClick={() => goTo(pageIdx - 1)}
              disabled={isFirst}
              className="flex items-center gap-1.5 px-4 py-3 rounded-xl text-sm font-medium border border-[var(--color-border-light)] hover:bg-[var(--color-warm-100)] disabled:opacity-30 active:scale-[0.98] transition-all"
            >
              <CaretLeft size={14} weight="bold" />Prev
            </button>
            <button
              onClick={() => goTo(pageIdx + 1)}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl text-sm font-semibold text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] active:scale-[0.98] transition-all"
            >
              {isLast ? 'Finish' : 'Next'}<CaretRight size={14} weight="bold" />
            </button>
          </div>

        </div>
      </div>

      {feedback && session && (
        <FeedbackModal status={feedback} session_id={session.session_id} onDone={onFeedbackDone} />
      )}
    </div>
  );
}
