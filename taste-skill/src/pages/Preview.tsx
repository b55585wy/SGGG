import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, ArrowCounterClockwise, Lightbulb, Tag, Star, ArrowRight, Warning, X } from '@phosphor-icons/react';
import { storyRegenerate } from '@/lib/api';
import { useSession } from '@/hooks/useSession';
import type { Draft, DissatisfactionReason } from '@/types/story';

const REASONS: { value: DissatisfactionReason; label: string }[] = [
  { value: 'too_long', label: 'Too long' }, { value: 'too_short', label: 'Too short' },
  { value: 'too_scary', label: 'Too scary' }, { value: 'too_preachy', label: 'Too preachy' },
  { value: 'not_cute', label: 'Not cute' }, { value: 'style_inconsistent', label: 'Style inconsistent' },
  { value: 'interaction_unclear', label: 'Interactions unclear' }, { value: 'repetitive', label: 'Repetitive' },
  { value: 'wrong_age_level', label: 'Wrong age level' }, { value: 'other', label: 'Other' },
];

export default function PreviewPage() {
  const navigate = useNavigate();
  const { start: startSession, loading: sessionLoading, error: sessionError } = useSession();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [regenCount, setRegenCount] = useState(0);
  const [showRegen, setShowRegen] = useState(false);
  const [reason, setReason] = useState<DissatisfactionReason | null>(null);
  const [regenLoading, setRegenLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem('storybook_draft');
      if (!s) { navigate('/'); return; }
      setDraft(JSON.parse(s));
    } catch { navigate('/'); }
  }, [navigate]);

  const handleRegen = async () => {
    if (!draft || !reason) return;
    setRegenLoading(true); setError(null);
    try {
      const res = await storyRegenerate({ previous_story_id: draft.story_id, target_food: draft.book_meta.theme_food, story_type: draft.book_meta.story_type, dissatisfaction_reason: reason });
      localStorage.setItem('storybook_draft', JSON.stringify(res.draft));
      setDraft(res.draft); setRegenCount(c => c + 1); setShowRegen(false); setReason(null);
    } catch (e) {
      setError(e instanceof Error && e.message.includes('429') ? '已达到重新生成上限（最多 2 次）。' : (e instanceof Error ? e.message : '重新生成失败，请稍后重试。'));
    } finally { setRegenLoading(false); }
  };

  const handleStart = async () => {
    if (!draft) return;
    setError(null);
    try { await startSession(draft.story_id); navigate('/reader'); }
    catch (e) { setError(e instanceof Error ? e.message : '启动阅读失败，请重试。'); }
  };

  if (!draft) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-8 h-8 border-2 border-[var(--color-accent)]/30 border-t-[var(--color-accent)] rounded-full animate-spin" />
    </div>
  );

  const m = draft.book_meta;
  const spring = { type: 'spring' as const, stiffness: 100, damping: 20 };

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-background)]">

      {/* ── 左栏 55%：故事内容（可滚动） ── */}
      <div className="w-[55%] overflow-y-auto px-10 py-8 border-r border-[var(--color-border-light)]">
        <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen size={20} weight="fill" className="text-[var(--color-accent)]" />
            <span className="text-xs font-mono font-medium tracking-wider text-[var(--color-muted)] uppercase">Story Preview</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tighter leading-none">{m.title}</h1>
          {m.subtitle && <p className="mt-1 text-base text-[var(--color-muted)]">{m.subtitle}</p>}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.05 }}
          className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border-light)] p-5 mb-4"
          style={{ boxShadow: '0 20px 40px -15px rgba(0,0,0,0.03)' }}>
          <p className="text-sm leading-relaxed">{m.summary}</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.1 }}
          className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border-light)] p-5"
          style={{ boxShadow: '0 20px 40px -15px rgba(0,0,0,0.03)' }}>
          <p className="text-xs font-semibold tracking-wider text-[var(--color-muted)] uppercase mb-2">Ending Preview</p>
          <p className="text-sm">{draft.ending.positive_feedback}</p>
          <p className="text-xs text-[var(--color-muted)] mt-2">Next goal: {draft.ending.next_micro_goal}</p>
        </motion.div>
      </div>

      {/* ── 右栏 45%：判断区（固定不滚动） ── */}
      <div className="w-[45%] flex flex-col px-10 py-8">

        {/* Design Logic — 置顶强制高亮 */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.05 }}
          className="bg-[var(--color-accent-light)] rounded-2xl border border-[var(--color-accent)]/20 p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb size={18} weight="fill" className="text-[var(--color-accent)]" />
            <span className="text-xs font-semibold tracking-wider text-[var(--color-accent)] uppercase">Design Logic</span>
          </div>
          <p className="text-sm leading-relaxed">{m.design_logic}</p>
        </motion.div>

        {/* Meta tags */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.1 }}
          className="flex flex-wrap gap-2 mb-4">
          {[m.theme_food, m.story_type, m.target_behavior_level, `${draft.pages.length} pages`].map((t, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--color-warm-100)] text-[var(--color-muted)] text-xs font-medium">
              {i < 2 ? <Tag size={12} weight="bold" /> : <Star size={12} weight="bold" />}{t}
            </span>
          ))}
        </motion.div>

        {/* 弹性空白，把操作区推到底部 */}
        <div className="flex-1" />

        {/* 错误提示 */}
        {(error || sessionError) && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="text-sm text-[var(--color-error)] bg-[var(--color-error-light)] px-4 py-3 rounded-xl mb-4 flex items-center gap-2">
            <Warning size={16} weight="fill" />{error || sessionError}
          </motion.p>
        )}

        {/* 重生成展开区 */}
        <AnimatePresence>
          {showRegen && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-4">
              <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border-light)] p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold">What to change?</p>
                  <button onClick={() => setShowRegen(false)} className="p-1 rounded-lg hover:bg-[var(--color-warm-100)]">
                    <X size={16} weight="bold" className="text-[var(--color-muted)]" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-4">
                  {REASONS.map(r => (
                    <button key={r.value} onClick={() => setReason(r.value)}
                      className={`py-2 px-3 rounded-xl text-xs font-medium border transition-all active:scale-[0.98] ${reason === r.value ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]' : 'border-[var(--color-border-light)] hover:border-[var(--color-border)]'}`}>
                      {r.label}
                    </button>
                  ))}
                </div>
                <button onClick={handleRegen} disabled={!reason || regenLoading}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold bg-[var(--color-foreground)] text-[var(--color-background)] hover:opacity-90 disabled:opacity-40 active:scale-[0.98] transition-all">
                  {regenLoading ? 'Regenerating...' : 'Regenerate'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 行动按钮 */}
        <div className="grid grid-cols-5 gap-3">
          <button onClick={() => setShowRegen(true)} disabled={regenCount >= 2 || showRegen}
            className="col-span-2 py-3.5 rounded-xl font-semibold text-sm border border-[var(--color-border)] hover:bg-[var(--color-warm-100)] disabled:opacity-40 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
            <ArrowCounterClockwise size={16} weight="bold" />Regen{regenCount > 0 && <span className="text-xs text-[var(--color-muted)]">({regenCount}/2)</span>}
          </button>
          <button onClick={handleStart} disabled={sessionLoading}
            className="col-span-3 py-3.5 rounded-xl font-semibold text-sm text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-40 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
            {sessionLoading ? <><span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Starting...</> : <>Start Reading<ArrowRight size={16} weight="bold" /></>}
          </button>
        </div>

      </div>
    </div>
  );
}
