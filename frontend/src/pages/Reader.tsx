import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { SpeakerHigh, SpeakerSlash, CaretRight, CaretLeft, SignOut, Warning, Tag, PaintBrush, BookOpen } from '@phosphor-icons/react';
import { InteractionLayer } from '@/components/InteractionLayer';
import { AbortReasonModal, type AbortDoneData } from '@/components/FeedbackModal';
import { PostReadingModal, type PostReadingDoneData } from '@/components/PostReadingModal';
import { useSession } from '@/hooks/useSession';
import { useTelemetry } from '@/hooks/useTelemetry';
import { useTTS } from '@/hooks/useTTS';
import { SUSModal } from '@/components/SUSModal';
import { storyGet } from '@/lib/api';
import { postJson } from '@/lib/ncApi';
import type { Draft, FeedbackStatus, TryLevel, AbortReason } from '@/types/story';

export default function ReaderPage() {
  const navigate = useNavigate();
  const { session, clear: clearSession } = useSession();
  const { track, flush } = useTelemetry(session?.session_id ?? null, session?.story_id ?? null);
  const tts = useTTS();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [showCover, setShowCover] = useState(true);
  const [pageIdx, setPageIdx] = useState(0);
  const [feedback, setFeedback] = useState<FeedbackStatus | null>(null);
  const [showSUS, setShowSUS] = useState(false);
  const [autoReadEnabled, setAutoReadEnabled] = useState(false);
  const autoReadRef = useRef(false);
  const autoReadSeqRef = useRef(0);
  const lastAutoReadKeyRef = useRef<string | null>(null);
  const enterRef = useRef(Date.now());
  const trackedRef = useRef(false);
  const sessionStartRef = useRef(new Date().toISOString());
  const interactionCountRef = useRef(0);

  useEffect(() => {
    try {
      const s = localStorage.getItem('storybook_draft');
      if (!s) { navigate('/noa/home'); return; }
      setDraft(JSON.parse(s));
    } catch { navigate('/noa/home'); }
  }, [navigate]);

  // 轮询图片：后台生成完成后自动刷新（最多 10 次，每 3 秒一次）
  useEffect(() => {
    if (!draft) return;
    const allPagesReady = draft.pages.every(p => p.image_url);
    const coverReady = !!draft.book_meta.cover_image_url;
    if (allPagesReady && coverReady) return;
    let attempts = 0;
    const timer = setInterval(async () => {
      if (++attempts > 10) { clearInterval(timer); return; }
      try {
        const res = await storyGet(draft.story_id);
        const newPagesReady = res.draft.pages.every(p => p.image_url);
        const newCoverReady = !!res.draft.book_meta.cover_image_url;
        if (res.draft.pages.some(p => p.image_url) || newCoverReady) {
          setDraft(res.draft);
          localStorage.setItem('storybook_draft', JSON.stringify(res.draft));
          if (newPagesReady && newCoverReady) clearInterval(timer);
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.story_id]);

  // 阅读前问卷：session 建立后上报（数据存在 localStorage）
  useEffect(() => {
    if (!session) return;
    const raw = localStorage.getItem('storybook_pre_survey');
    if (raw) {
      try { track('pre_session_survey', JSON.parse(raw)); } catch { /* ignore */ }
      localStorage.removeItem('storybook_pre_survey');
    }
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  // 页面可见性变化埋点
  useEffect(() => {
    if (!session) return;
    const handler = () => track('session_visibility', { state: document.hidden ? 'hidden' : 'visible' });
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  // track page_view (skip on cover page)
  useEffect(() => {
    if (!draft || !session || showCover) return;
    const p = draft.pages[pageIdx];
    if (!p || trackedRef.current) return;
    track('page_view', { behavior_anchor: p.behavior_anchor }, p.page_id);
    trackedRef.current = true;
    enterRef.current = Date.now();
    return () => { trackedRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIdx, draft, session, showCover]);

  // 翻页后自动续读：故事文字读完后接续朗读互动提示
  const speakPage = useCallback((p: typeof draft extends null ? never : NonNullable<typeof draft>['pages'][0]) => {
    const onEnd = p.interaction.type !== 'none' && p.interaction.instruction
      ? () => {
        const instruction = p.interaction.instruction;
        if (p.interaction.type === 'choice' && Array.isArray(p.branch_choices) && p.branch_choices.length > 0) {
          const optionsText = p.branch_choices
            .map((c, idx) => `选项${idx + 1}：${c.label}`)
            .join('。');
          tts.speak(instruction, 'zhimiao', () => tts.speak(`${optionsText}。`, 'zhimiao'));
          return;
        }
        tts.speak(instruction, 'zhimiao');
      }
      : undefined;
    tts.speak(p.text, 'zhimiao', onEnd);
  }, [tts]);

  useEffect(() => {
    autoReadRef.current = autoReadEnabled;
  }, [autoReadEnabled]);

  useEffect(() => {
    if (!draft || showCover) return;
    tts.stop();
    if (!autoReadEnabled) {
      lastAutoReadKeyRef.current = null;
      return;
    }
    const p = draft.pages[pageIdx];
    if (!p) return;
    const key = `${autoReadSeqRef.current}:${p.page_id}`;
    if (lastAutoReadKeyRef.current === key) return;
    lastAutoReadKeyRef.current = key;
    speakPage(p);
  }, [pageIdx, draft, showCover, autoReadEnabled, tts, speakPage]);

  useEffect(() => () => {
    tts.stop();
  }, [tts]);

  const trackDwell = useCallback(() => {
    if (!draft || !session) return;
    const p = draft.pages[pageIdx];
    if (!p) return;
    track('page_dwell', { duration_ms: Date.now() - enterRef.current }, p.page_id);
  }, [draft, session, pageIdx, track]);

  const goTo = useCallback((next: number) => {
    if (!draft) return;
    tts.stop();
    // Going back from page 0 → show cover
    if (next < 0) {
      setShowCover(true);
      return;
    }
    const fromPage = draft.pages[pageIdx]?.page_no ?? pageIdx + 1;
    trackDwell();
    if (next < pageIdx) {
      track('page_back', { from_page: fromPage, to_page: next + 1 }, draft.pages[pageIdx].page_id);
    }
    if (next >= draft.pages.length) {
      if (session) {
        track('story_complete', { completion_rate: 1.0 }, draft.pages[draft.pages.length - 1].page_id);
        flush();
        setFeedback('COMPLETED');
      } else {
        // Read-only mode — just go home
        clearSession();
        localStorage.removeItem('storybook_draft');
        navigate('/noa/home');
      }
      return;
    }
    setPageIdx(next);
  }, [draft, pageIdx, session, trackDwell, track, flush, tts, clearSession, navigate]);

  const onInteractionStart = useCallback((interactionType: string, eventKey: string) => {
    if (!draft) return;
    tts.stop();
    track('interaction_start', { interaction_type: interactionType, event_key: eventKey }, draft.pages[pageIdx].page_id);
  }, [draft, pageIdx, track, tts]);

  const onInteraction = useCallback((key: string, ms: number) => {
    if (!draft) return;
    if (autoReadRef.current) {
      tts.stop();
    }
    interactionCountRef.current += 1;
    track('interaction', { event_key: key, latency_ms: ms }, draft.pages[pageIdx].page_id);
  }, [draft, pageIdx, track, tts]);

  const onBranch = useCallback((choiceId: string, nextPageId: string) => {
    if (!draft) return;
    tts.stop();
    track('branch_select', { choice_id: choiceId }, draft.pages[pageIdx].page_id);
    const idx = draft.pages.findIndex(p => p.page_id === nextPageId);
    if (idx >= 0) { trackDwell(); setPageIdx(idx); }
  }, [draft, pageIdx, track, trackDwell, tts]);

  const onTTS = useCallback(() => {
    if (!draft) return;
    const p = draft.pages[pageIdx];
    if (autoReadRef.current) {
      // 关闭自动朗读
      autoReadRef.current = false;
      setAutoReadEnabled(false);
      autoReadSeqRef.current += 1;
      lastAutoReadKeyRef.current = null;
      tts.stop();
      track('read_aloud_play', { enabled: false, page_id: p.page_id }, p.page_id);
    } else {
      // 开启自动朗读
      autoReadRef.current = true;
      setAutoReadEnabled(true);
      autoReadSeqRef.current += 1;
      lastAutoReadKeyRef.current = null;
      tts.stop();
      track('read_aloud_play', { enabled: true, page_id: p.page_id }, p.page_id);
    }
  }, [draft, pageIdx, tts, track]);

  const TOTAL_SESSIONS = 9;

  const logReadingSession = useCallback(async (
    extra: { tryLevel?: TryLevel | null; abortReason?: AbortReason | null } | null,
    pagesRead: number,
    completed: boolean,
  ) => {
    if (!draft) return;
    const bookId = localStorage.getItem('storybook_book_id') ?? undefined;
    const sessionType = session !== null
      ? 'experiment'
      : (localStorage.getItem('storybook_source') ?? 'preview');
    const endedAt = new Date().toISOString();
    const durationMs = Date.now() - new Date(sessionStartRef.current).getTime();
    try {
      await postJson('/api/reading/log', {
        bookId,
        startedAt: sessionStartRef.current,
        endedAt,
        durationMs,
        totalPages: draft.pages.length,
        pagesRead,
        interactionCount: interactionCountRef.current,
        completed,
        sessionType,
        tryLevel: extra?.tryLevel ?? null,
        abortReason: extra?.abortReason ?? null,
      });
    } catch { /* best-effort */ }
  }, [draft, session]);

  const goHome = useCallback(() => {
    clearSession();
    localStorage.removeItem('storybook_draft');
    localStorage.removeItem('storybook_book_id');
    localStorage.removeItem('storybook_source');
    navigate('/noa/home');
  }, [clearSession, navigate]);

  const onExit = useCallback(() => {
    tts.stop();
    if (session) {
      trackDwell(); flush(); setFeedback('ABORTED');
    } else {
      void logReadingSession(null, pageIdx + 1, false);
      goHome();
    }
  }, [session, trackDwell, flush, goHome, logReadingSession, pageIdx, tts]);

  const onPostReadingDone = useCallback((data: PostReadingDoneData) => {
    tts.stop();
    setFeedback(null);
    void logReadingSession({ tryLevel: data.tryLevel }, pageIdx + 1, true);
    if (session && session.session_index >= TOTAL_SESSIONS - 1) {
      setShowSUS(true);
    } else {
      goHome();
    }
  }, [session, goHome, logReadingSession, pageIdx, tts]);

  const onAbortDone = useCallback((data: AbortDoneData) => {
    tts.stop();
    setFeedback(null);
    void logReadingSession({ abortReason: data.abortReason }, pageIdx + 1, false);
    if (session && session.session_index >= TOTAL_SESSIONS - 1) {
      setShowSUS(true);
    } else {
      goHome();
    }
  }, [session, goHome, logReadingSession, pageIdx, tts]);

  const onSUSDone = useCallback(() => {
    tts.stop();
    goHome();
  }, [goHome, tts]);

  if (!draft) return (
    <div className="flex items-center justify-center min-h-screen" style={{ background: 'linear-gradient(145deg, #ecfdf5 0%, #f8faf9 55%, #fafaf9 100%)' }}>
      <div className="w-8 h-8 border-2 border-[var(--color-accent)]/30 border-t-[var(--color-accent)] rounded-full animate-spin" />
    </div>
  );

  const page = draft.pages[pageIdx];
  const isLast = pageIdx === draft.pages.length - 1;
  const progress = showCover ? 0 : ((pageIdx + 1) / draft.pages.length) * 100;

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ background: 'linear-gradient(145deg, #ecfdf5 0%, #f8faf9 55%, #fafaf9 100%)' }}
    >

      {/* ── 顶部通栏 ── */}
      <header
        className="relative flex items-center justify-between h-14 px-6 flex-shrink-0 z-20"
        style={{
          background: 'rgba(236,253,245,0.85)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(5,150,105,0.1)',
        }}
      >
        {/* 退出 */}
        <button
          onClick={onExit}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all active:scale-[0.97]"
          style={{ borderColor: 'var(--color-border-light)', background: 'white', color: 'var(--color-muted)' }}
        >
          <SignOut size={13} weight="bold" />退出
        </button>

        {/* 进度条 + 页码（绝对居中） */}
        {!showCover && (
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-3">
            <div
              className="w-52 rounded-full overflow-hidden"
              style={{ height: 6, background: 'var(--color-warm-200)' }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'linear-gradient(90deg, #059669, #34d399)' }}
                animate={{ width: `${progress}%` }}
                transition={{ type: 'spring', stiffness: 100, damping: 20 }}
              />
            </div>
            <span
              className="text-xs font-mono font-semibold tabular-nums rounded-full px-2.5 py-0.5"
              style={{ background: 'var(--color-accent-light)', color: 'var(--color-accent)' }}
            >
              {pageIdx + 1} / {draft.pages.length}
            </span>
          </div>
        )}

        {/* TTS */}
        {!showCover && tts.isSupported ? (
          <button
            onClick={onTTS}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all active:scale-[0.97]"
            style={autoReadEnabled
              ? { borderColor: 'var(--color-accent)', background: 'var(--color-accent-light)', color: 'var(--color-accent)' }
              : { borderColor: 'var(--color-border-light)', background: 'white', color: 'var(--color-muted)' }
            }
          >
            {autoReadEnabled ? <SpeakerHigh size={13} weight="fill" /> : <SpeakerSlash size={13} weight="light" />}
            {autoReadEnabled ? '朗读中' : '朗读'}
          </button>
        ) : !showCover ? (
          <span className="flex items-center gap-1 text-xs rounded-full px-3 py-1.5" style={{ color: 'var(--color-muted)', background: 'var(--color-warm-100)' }}>
            <Warning size={12} weight="fill" />朗读不可用
          </span>
        ) : <span />}
      </header>

      {/* ── 封面页 ── */}
      {showCover ? (
        <div className="flex flex-1 overflow-hidden p-3 pt-3 gap-3">
          {/* 左栏：封面图（竖版） */}
          <div
            className="relative w-[42%] flex-shrink-0 overflow-hidden rounded-[2rem]"
            style={{ background: 'linear-gradient(160deg, #ecfdf5 0%, #f0fdf4 40%, #f8fdf9 100%)' }}
          >
            {draft.book_meta.cover_image_url ? (
              <img
                src={draft.book_meta.cover_image_url}
                alt={`${draft.book_meta.title} 封面`}
                className="w-full h-full object-cover rounded-[2rem]"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                  style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(8px)' }}
                >
                  <PaintBrush size={32} weight="light" style={{ color: 'var(--color-accent)' }} />
                </div>
                <p className="text-sm" style={{ color: 'var(--color-muted)' }}>封面生成中...</p>
              </div>
            )}
          </div>

          {/* 右栏：标题 + 副标题 + 开始阅读 */}
          <div
            className="flex-1 flex flex-col overflow-hidden rounded-[2rem]"
            style={{ background: 'white', boxShadow: '0 8px 28px -8px rgba(0,0,0,0.06), 0 0 0 1px rgba(231,229,228,0.6)' }}
          >
            <div className="flex-1 flex flex-col items-center justify-center px-9 py-7">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 150, damping: 20 }}
                className="text-center"
              >
                <h1 className="text-3xl font-bold leading-snug mb-3" style={{ color: 'var(--color-foreground)' }}>
                  {draft.book_meta.title}
                </h1>
                <p className="text-lg mb-8" style={{ color: 'var(--color-muted)' }}>
                  {draft.book_meta.subtitle}
                </p>
                <button
                  onClick={() => setShowCover(false)}
                  className="inline-flex items-center gap-2 px-8 py-3.5 rounded-full text-base font-bold text-white transition-all active:scale-[0.97]"
                  style={{
                    background: 'linear-gradient(135deg, #059669, #047857)',
                    boxShadow: '0 6px 18px -4px rgba(5,150,105,0.4)',
                  }}
                >
                  <BookOpen size={18} weight="bold" />
                  开始阅读
                </button>
              </motion.div>
            </div>
          </div>
        </div>
      ) : (
      /* ── 主区域：左图 + 右文 ── */
      <div className="flex flex-1 overflow-hidden p-3 pt-3 gap-3">

        {/* 左栏 58%：插图 */}
        <div
          className="relative w-[58%] flex-shrink-0 overflow-hidden rounded-[2rem]"
          style={{ background: 'linear-gradient(160deg, #ecfdf5 0%, #f0fdf4 40%, #f8fdf9 100%)' }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={page.page_id + '-img'}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="absolute inset-0 flex flex-col items-center justify-center"
            >
              {page.image_url ? (
                /* 真实插图 */
                <img
                  src={page.image_url}
                  alt={page.image_prompt}
                  className="w-full h-full object-cover rounded-[2rem]"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-9 h-9 border-2 border-[var(--color-accent)]/25 border-t-[var(--color-accent)] rounded-full animate-spin" />
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* 右栏 42%：文字 + 互动 + 导航 */}
        <div
          className="flex-1 flex flex-col overflow-hidden rounded-[2rem]"
          style={{ background: 'white', boxShadow: '0 8px 28px -8px rgba(0,0,0,0.06), 0 0 0 1px rgba(231,229,228,0.6)' }}
        >

          {/* 可滚动内容区 */}
          <div className="flex-1 overflow-y-auto px-9 py-7" style={{ scrollbarWidth: 'none' }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={page.page_id}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ type: 'spring', stiffness: 200, damping: 25 }}
              >
                {/* 故事文字 */}
                <p className="text-2xl leading-loose" style={{ color: 'var(--color-foreground)' }}>
                  {page.text}
                </p>

                {/* 行为锚点 badge */}
                <div className="mt-4 inline-flex items-center gap-1.5 rounded-full px-3 py-1" style={{ background: 'var(--color-warm-100)' }}>
                  <Tag size={11} weight="bold" style={{ color: 'var(--color-muted)' }} />
                  <span className="text-xs font-medium" style={{ color: 'var(--color-muted)' }}>{page.behavior_anchor}</span>
                </div>

                {/* 互动层 */}
                <InteractionLayer
                  interaction={page.interaction}
                  branchChoices={page.branch_choices}
                  onInteractionComplete={onInteraction}
                  onBranchSelect={onBranch}
                  onInteractionStart={onInteractionStart}
                  speak={tts.speak}
                  autoRead={autoReadEnabled}
                  pageId={page.page_id}
                />

                {/* 最后一页：正反馈区 */}
                {isLast && (
                  <motion.div
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, type: 'spring', stiffness: 100, damping: 20 }}
                    className="mt-6 rounded-[1.5rem] p-5"
                    style={{ background: 'var(--color-accent-light)', border: '1px solid rgba(5,150,105,0.15)' }}
                  >
                    <p className="text-sm font-medium" style={{ color: 'var(--color-accent)' }}>{draft.ending.positive_feedback}</p>
                    <p className="text-xs mt-2" style={{ color: 'var(--color-accent-hover)' }}>下一个目标：{draft.ending.next_micro_goal}</p>
                  </motion.div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* 底部导航（固定） */}
          <div
            className="flex-shrink-0 flex items-center gap-3 px-7 py-5"
            style={{ borderTop: '1px solid var(--color-border-light)' }}
          >
            <button
              onClick={() => goTo(pageIdx - 1)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold border transition-all active:scale-[0.97]"
              style={{ borderColor: 'var(--color-border-light)', background: 'white', color: 'var(--color-foreground)' }}
            >
              <CaretLeft size={14} weight="bold" />上一页
            </button>
            <button
              onClick={() => goTo(pageIdx + 1)}
              className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-bold text-white transition-all active:scale-[0.97]"
              style={{
                background: 'linear-gradient(135deg, #059669, #047857)',
                border: 'none',
                boxShadow: '0 6px 18px -4px rgba(5,150,105,0.4)',
              }}
            >
              {isLast ? '完成 ✓' : '下一页'}<CaretRight size={14} weight="bold" />
            </button>
          </div>

        </div>
      </div>
      )}

      {feedback === 'COMPLETED' && session && (
        <PostReadingModal
          sessionId={session.session_id}
          themeFood={draft.book_meta.theme_food}
          onDone={onPostReadingDone}
        />
      )}
      {feedback === 'ABORTED' && session && (
        <AbortReasonModal session_id={session.session_id} onDone={onAbortDone} />
      )}
      {showSUS && session && (
        <SUSModal session_id={session.session_id} onDone={onSUSDone} />
      )}
    </div>
  );
}
