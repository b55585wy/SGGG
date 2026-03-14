import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { SpeakerHigh, SpeakerSlash, CaretRight, CaretLeft, SignOut, Warning } from '@phosphor-icons/react';
import { InteractionLayer } from '@/components/InteractionLayer';
import { FeedbackModal, type FeedbackDoneData } from '@/components/FeedbackModal';
import RegenModal, { POST_COMPLETE_REGEN_PAYLOAD_KEY } from '@/components/RegenModal';
import { useSession } from '@/hooks/useSession';
import { useTelemetry } from '@/hooks/useTelemetry';
import { useTTS } from '@/hooks/useTTS';
import { storyGet } from '@/lib/api';
import { postJson } from '@/lib/ncApi';
import type { Draft } from '@/types/story';

export default function ReaderPage() {
  const navigate = useNavigate();
  const { session, clear: clearSession } = useSession();
  const { track, flush } = useTelemetry(session?.session_id ?? null, session?.story_id ?? null);
  const tts = useTTS();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [pageIdx, setPageIdx] = useState(0);
  const [showAbortFeedback, setShowAbortFeedback] = useState(false);
  const [showCompleteRegenModal, setShowCompleteRegenModal] = useState(false);
  const [autoReadEnabled, setAutoReadEnabled] = useState(false);
  const [interactionFrameShown, setInteractionFrameShown] = useState<Record<string, boolean>>({});
  const autoReadRef = useRef(false);
  const autoReadSeqRef = useRef(0);
  const lastAutoReadKeyRef = useRef<string | null>(null);
  const enterRef = useRef(Date.now());
  const trackedRef = useRef(false);
  const sessionStartRef = useRef(new Date().toISOString());
  const readingEndedAtRef = useRef<string | null>(null);
  const interactionCountRef = useRef(0);
  const completionHandledRef = useRef(false);
  const readerVoice = useMemo<'zhimiao' | 'zhishuo'>(() => {
    const gender = typeof (draft as { child_profile?: { gender?: unknown } } | null)?.child_profile?.gender === 'string'
      ? String((draft as { child_profile?: { gender?: string } }).child_profile?.gender).toLowerCase()
      : '';
    return gender === 'male' ? 'zhishuo' : 'zhimiao';
  }, [draft]);

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
    if (draft.pages.every(p => p.image_url)) return;
    let attempts = 0;
    const timer = setInterval(async () => {
      if (++attempts > 10) { clearInterval(timer); return; }
      try {
        const res = await storyGet(draft.story_id);
        if (res.draft.pages.some(p => p.image_url)) {
          setDraft(res.draft);
          localStorage.setItem('storybook_draft', JSON.stringify(res.draft));
          if (res.draft.pages.every(p => p.image_url)) clearInterval(timer);
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

  // track page_view
  useEffect(() => {
    if (!draft || !session) return;
    const p = draft.pages[pageIdx];
    if (!p || trackedRef.current) return;
    track('page_view', { behavior_anchor: p.behavior_anchor }, p.page_id);
    trackedRef.current = true;
    enterRef.current = Date.now();
    return () => { trackedRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageIdx, draft, session]);

  // 翻页后自动续读：故事文字读完后接续朗读互动提示
  const speakPage = useCallback((p: typeof draft extends null ? never : NonNullable<typeof draft>['pages'][0]) => {
    const onEnd = p.interaction.type !== 'none' && p.interaction.instruction
      ? () => {
        const instruction = p.interaction.instruction;
        if (p.interaction.type === 'choice' && Array.isArray(p.branch_choices) && p.branch_choices.length > 0) {
          const optionsText = p.branch_choices
            .map((c, idx) => `选项${idx + 1}：${c.label}`)
            .join('。');
          tts.speak(instruction, readerVoice, () => tts.speak(`${optionsText}。`, readerVoice));
          return;
        }
        tts.speak(instruction, readerVoice);
      }
      : undefined;
    tts.speak(p.text, readerVoice, onEnd);
  }, [tts, readerVoice]);

  useEffect(() => {
    autoReadRef.current = autoReadEnabled;
  }, [autoReadEnabled]);

  useEffect(() => {
    if (!draft) return;
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
  }, [pageIdx, draft, autoReadEnabled, tts, speakPage]);

  useEffect(() => () => {
    tts.stop();
  }, [tts]);

  const logReadingSession = useCallback(async (
    pagesRead: number,
    completed: boolean,
    options?: { tryLevel?: string | null; abortReason?: string | null },
  ) => {
    if (!draft) return;
    const bookId = localStorage.getItem('storybook_book_id') ?? undefined;
    const sessionType = session !== null
      ? 'experiment'
      : (localStorage.getItem('storybook_source') ?? 'preview');
    const endedAt = readingEndedAtRef.current ?? new Date().toISOString();
    const startMs = Date.parse(sessionStartRef.current);
    const endMs = Date.parse(endedAt);
    const durationMs = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs
      ? endMs - startMs
      : Math.max(0, Date.now() - new Date(sessionStartRef.current).getTime());
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
        tryLevel: options?.tryLevel ?? null,
        abortReason: options?.abortReason ?? null,
      }, { keepalive: true });
    } catch { /* best-effort */ }
  }, [draft, session]);

  const trackDwell = useCallback(() => {
    if (!draft || !session) return;
    const p = draft.pages[pageIdx];
    if (!p) return;
    track('page_dwell', { duration_ms: Date.now() - enterRef.current }, p.page_id);
  }, [draft, session, pageIdx, track]);

  const completeSessionAndGoHome = useCallback((regenPayload?: Record<string, unknown>) => {
    if (!draft || !session || completionHandledRef.current) return;
    completionHandledRef.current = true;
    if (regenPayload) {
      try {
        sessionStorage.setItem(POST_COMPLETE_REGEN_PAYLOAD_KEY, JSON.stringify(regenPayload));
      } catch { /* ignore */ }
    }
    if (!readingEndedAtRef.current) readingEndedAtRef.current = new Date().toISOString();
    track('story_complete', { completion_rate: 1.0 }, draft.pages[draft.pages.length - 1].page_id);
    flush();
    void logReadingSession(draft.pages.length, true);
    clearSession();
    localStorage.removeItem('storybook_draft');
    localStorage.removeItem('storybook_book_id');
    localStorage.removeItem('storybook_source');
    navigate('/noa/home');
  }, [draft, session, track, flush, logReadingSession, clearSession, navigate]);

  const goTo = useCallback((next: number) => {
    if (!draft) return;
    tts.stop();
    const fromPage = draft.pages[pageIdx]?.page_no ?? pageIdx + 1;
    trackDwell();
    if (next < pageIdx) {
      track('page_back', { from_page: fromPage, to_page: next + 1 }, draft.pages[pageIdx].page_id);
    }
    if (next >= draft.pages.length) {
      if (session) {
        setShowCompleteRegenModal(true);
      } else {
        // Read-only mode — just go home
        clearSession();
        localStorage.removeItem('storybook_draft');
        localStorage.removeItem('storybook_book_id');
        localStorage.removeItem('storybook_source');
        navigate('/noa/home');
      }
      return;
    }
    if (autoReadRef.current) {
      // Force replay on the next page even if keys collide in edge flows.
      lastAutoReadKeyRef.current = null;
    }
    setPageIdx(next);
  }, [draft, pageIdx, session, trackDwell, track, tts, clearSession, navigate]);

  const onInteractionStart = useCallback((interactionType: string, eventKey: string) => {
    if (!draft) return;
    track('interaction_start', { interaction_type: interactionType, event_key: eventKey }, draft.pages[pageIdx].page_id);
  }, [draft, pageIdx, track]);

  const onInteraction = useCallback((key: string, ms: number) => {
    if (!draft) return;
    interactionCountRef.current += 1;
    const currentPage = draft.pages[pageIdx];
    track('interaction', { event_key: key, latency_ms: ms }, currentPage.page_id);
    if (
      currentPage.interaction.type === 'tap' ||
      currentPage.interaction.type === 'drag' ||
      currentPage.interaction.type === 'mimic'
    ) {
      if (currentPage.interaction_image_url) {
        setInteractionFrameShown((prev) => (
          prev[currentPage.page_id] ? prev : { ...prev, [currentPage.page_id]: true }
        ));
      }
    }
  }, [draft, pageIdx, track]);

  const onBranch = useCallback((choiceId: string, nextPageId: string) => {
    if (!draft) return;
    tts.stop();
    track('branch_select', { choice_id: choiceId }, draft.pages[pageIdx].page_id);
    const idx = draft.pages.findIndex(p => p.page_id === nextPageId);
    if (idx >= 0) {
      trackDwell();
      if (autoReadRef.current) lastAutoReadKeyRef.current = null;
      setPageIdx(idx);
    }
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

  const onExit = useCallback(() => {
    tts.stop();
    if (session && !readingEndedAtRef.current) readingEndedAtRef.current = new Date().toISOString();
    if (session) {
      trackDwell();
      flush();
      setShowAbortFeedback(true);
      return;
    }
    // 预览模式直接落阅读会话并返回
    void logReadingSession(pageIdx + 1, false);
    clearSession();
    localStorage.removeItem('storybook_draft');
    localStorage.removeItem('storybook_book_id');
    localStorage.removeItem('storybook_source');
    navigate('/noa/home');
  }, [session, trackDwell, flush, clearSession, navigate, logReadingSession, pageIdx, tts]);

  const onAbortFeedbackDone = useCallback((data: FeedbackDoneData) => {
    tts.stop();
    setShowAbortFeedback(false);
    if (!readingEndedAtRef.current) readingEndedAtRef.current = new Date().toISOString();
    void logReadingSession(pageIdx + 1, false, { abortReason: data.abortReason ?? null });
    clearSession();
    localStorage.removeItem('storybook_draft');
    localStorage.removeItem('storybook_book_id');
    localStorage.removeItem('storybook_source');
    navigate('/noa/home');
  }, [clearSession, logReadingSession, navigate, pageIdx, tts]);

  if (!draft) return (
    <div className="flex items-center justify-center min-h-screen" style={{ background: 'linear-gradient(145deg, #ecfdf5 0%, #f8faf9 55%, #fafaf9 100%)' }}>
      <div className="w-8 h-8 border-2 border-[var(--color-accent)]/30 border-t-[var(--color-accent)] rounded-full animate-spin" />
    </div>
  );

  const page = draft.pages[pageIdx];
  const isLast = pageIdx === draft.pages.length - 1;
  const isFirst = pageIdx === 0;
  const progress = ((pageIdx + 1) / draft.pages.length) * 100;
  const showInteractionFrame = !!interactionFrameShown[page.page_id]
    && (
      page.interaction.type === 'tap'
      || page.interaction.type === 'drag'
      || page.interaction.type === 'mimic'
    )
    && !!page.interaction_image_url;
  const currentImageUrl = showInteractionFrame ? page.interaction_image_url : page.image_url;
  const postReadTask = (
    typeof draft.ending.post_read_task === 'string' && draft.ending.post_read_task.trim()
      ? draft.ending.post_read_task.trim()
      : `这周选一个日常时刻，和家长围绕${draft.book_meta?.theme_food || '今天故事里的食物'}做一次“发现任务”：找到它、说一个特点、记录一句感受。`
  );

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

        {/* TTS */}
        {tts.isSupported ? (
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
        ) : (
          <span className="flex items-center gap-1 text-xs rounded-full px-3 py-1.5" style={{ color: 'var(--color-muted)', background: 'var(--color-warm-100)' }}>
            <Warning size={12} weight="fill" />朗读不可用
          </span>
        )}
      </header>

      {/* ── 主区域：左图 + 右文 ── */}
      <div className="flex flex-1 overflow-hidden p-3 pt-3 gap-3">

        {/* 左栏 58%：插图 */}
        <div
          className="relative w-[58%] flex-shrink-0 overflow-hidden rounded-[2rem]"
          style={{ background: 'linear-gradient(160deg, #ecfdf5 0%, #f0fdf4 40%, #f8fdf9 100%)' }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={`${page.page_id}-${showInteractionFrame ? 'interaction' : 'base'}-img`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="absolute inset-0 flex flex-col items-center justify-center"
            >
              {currentImageUrl ? (
                /* 真实插图 */
                <img
                  src={currentImageUrl}
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

                {/* 互动层 */}
                <InteractionLayer
                  interaction={page.interaction}
                  branchChoices={page.branch_choices}
                  onInteractionComplete={onInteraction}
                  onBranchSelect={onBranch}
                  onInteractionStart={onInteractionStart}
                  speak={tts.speak}
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
                    <p className="text-xs mt-2" style={{ color: 'var(--color-accent-hover)' }}>线下小任务：{postReadTask}</p>
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
              disabled={isFirst}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold border transition-all active:scale-[0.97] disabled:opacity-30"
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

      {showAbortFeedback && session && (
        <FeedbackModal status="ABORTED" session_id={session.session_id} onDone={onAbortFeedbackDone} />
      )}

      {showCompleteRegenModal && session && (
        <RegenModal
          themeFood={draft.book_meta?.theme_food ?? ''}
          currentStoryType={draft.book_meta?.story_type ?? 'light_fantasy'}
          regenerateCount={0}
          mode="next_episode"
          onClose={() => {
            setShowCompleteRegenModal(false);
            completeSessionAndGoHome();
          }}
          onSubmit={(payload) => {
            setShowCompleteRegenModal(false);
            completeSessionAndGoHome(payload);
          }}
        />
      )}

    </div>
  );
}
