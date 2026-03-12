import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from '@phosphor-icons/react';
import { feedbackSubmit } from '@/lib/api';
import type { AbortReason } from '@/types/story';

const ABORT_REASONS: { value: AbortReason; label: string }[] = [
  { value: 'bored',          label: '孩子无聊了' },
  { value: 'scared',         label: '孩子害怕了' },
  { value: 'distracted',     label: '孩子分心了' },
  { value: 'parent_stopped', label: '家长主动停止' },
  { value: 'technical',      label: '技术问题' },
  { value: 'other',          label: '其他原因' },
];

export type AbortDoneData = {
  abortReason: AbortReason;
};

interface Props {
  session_id: string;
  onDone: (data: AbortDoneData) => void;
  onCancel?: () => void;
}

/** Modal shown when a reading session is aborted early. */
export function AbortReasonModal({ session_id, onDone, onCancel }: Props) {
  const [abortReason, setAbortReason] = useState<AbortReason | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = abortReason !== null;

  // X button / backdrop: cancel and return to reading (accidental tap)
  const handleClose = () => {
    if (submitting) return;
    if (onCancel) { onCancel(); return; }
    // fallback: auto-submit if no onCancel provided
    const finalReason = abortReason ?? 'other';
    feedbackSubmit({ session_id, status: 'ABORTED', abort_reason: finalReason }).catch(() => {});
    onDone({ abortReason: finalReason });
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await feedbackSubmit({
        session_id,
        status: 'ABORTED',
        abort_reason: abortReason!,
        ...(notes ? { notes } : {}),
      });
      onDone({ abortReason: abortReason! });
    } catch {
      setError('提交失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-foreground)]/30 backdrop-blur-sm px-4"
        onClick={handleClose}>
        <motion.div initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
          onClick={(e) => e.stopPropagation()}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          className="bg-[var(--color-surface)] rounded-2xl p-6 max-w-sm w-full border border-[var(--color-border-light)]"
          style={{ boxShadow: '0 20px 40px -15px rgba(0,0,0,0.1)' }}>

          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-semibold tracking-tight">为什么提前结束？</h2>
            <button onClick={handleClose} className="p-1 rounded-lg hover:bg-[var(--color-warm-100)] transition-colors">
              <X size={20} weight="bold" className="text-[var(--color-muted)]" />
            </button>
          </div>

          <div className="space-y-2 mb-5">
            {ABORT_REASONS.map((ar) => (
              <button key={ar.value} onClick={() => setAbortReason(ar.value)}
                className={`w-full py-2.5 px-4 rounded-xl border text-left text-sm font-medium transition-all active:scale-[0.98]
                  ${abortReason === ar.value ? 'border-[var(--color-error)] bg-[var(--color-error-light)] text-[var(--color-error)]' : 'border-[var(--color-border-light)] hover:border-[var(--color-border)]'}`}>
                {ar.label}
              </button>
            ))}
          </div>

          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="补充说明（可选）"
            className="w-full border border-[var(--color-border-light)] rounded-xl p-3 text-sm mb-4 resize-none h-20 bg-[var(--color-warm-50)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors" />

          {error && <p className="text-sm text-[var(--color-error)] mb-3">{error}</p>}

          <button onClick={handleSubmit} disabled={!canSubmit || submitting}
            className="w-full py-3 rounded-xl font-semibold text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all">
            {submitting ? '提交中...' : '提交反馈'}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
