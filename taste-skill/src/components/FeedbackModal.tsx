import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, Flower, Hand, Drop, Cookie, Smiley, Star, X } from '@phosphor-icons/react';
import { feedbackSubmit } from '@/lib/api';
import type { FeedbackStatus, TryLevel, AbortReason } from '@/types/story';

const TRY_LEVELS: { value: TryLevel; label: string; icon: React.ReactNode }[] = [
  { value: 'look', label: 'Looked', icon: <Eye size={24} weight="light" /> },
  { value: 'smell', label: 'Smelled', icon: <Flower size={24} weight="light" /> },
  { value: 'touch', label: 'Touched', icon: <Hand size={24} weight="light" /> },
  { value: 'lick', label: 'Licked', icon: <Drop size={24} weight="light" /> },
  { value: 'bite', label: 'Bit', icon: <Cookie size={24} weight="light" /> },
  { value: 'chew', label: 'Chewed', icon: <Smiley size={24} weight="light" /> },
  { value: 'swallow', label: 'Swallowed', icon: <Star size={24} weight="fill" /> },
];

const ABORT_REASONS: { value: AbortReason; label: string }[] = [
  { value: 'bored', label: 'Got bored' },
  { value: 'scared', label: 'Got scared' },
  { value: 'distracted', label: 'Got distracted' },
  { value: 'parent_stopped', label: 'Parent stopped' },
  { value: 'technical', label: 'Technical issue' },
  { value: 'other', label: 'Other' },
];

interface Props {
  status: FeedbackStatus;
  session_id: string;
  onDone: () => void;
}

export function FeedbackModal({ status, session_id, onDone }: Props) {
  const [tryLevel, setTryLevel] = useState<TryLevel | null>(null);
  const [abortReason, setAbortReason] = useState<AbortReason | null>(null);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = status === 'COMPLETED' ? tryLevel !== null : abortReason !== null;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      await feedbackSubmit({
        session_id,
        status,
        ...(status === 'COMPLETED' ? { try_level: tryLevel! } : { abort_reason: abortReason! }),
        ...(notes ? { notes } : {}),
      });
      onDone();
    } catch {
      setError('提交失败，请稍后重试。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-foreground)]/30 backdrop-blur-sm px-4">
        <motion.div initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          className="bg-[var(--color-surface)] rounded-2xl p-6 max-w-sm w-full border border-[var(--color-border-light)]"
          style={{ boxShadow: '0 20px 40px -15px rgba(0,0,0,0.1)' }}>

          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-semibold tracking-tight">{status === 'COMPLETED' ? 'How did it go?' : 'Why did we stop?'}</h2>
            <button onClick={onDone} className="p-1 rounded-lg hover:bg-[var(--color-warm-100)] transition-colors">
              <X size={20} weight="bold" className="text-[var(--color-muted)]" />
            </button>
          </div>

          {status === 'COMPLETED' ? (
            <div className="grid grid-cols-4 gap-2 mb-5">
              {TRY_LEVELS.map((tl) => (
                <button key={tl.value} onClick={() => setTryLevel(tl.value)}
                  className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border transition-all active:scale-[0.98]
                    ${tryLevel === tl.value ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]' : 'border-[var(--color-border-light)] hover:border-[var(--color-border)]'}`}>
                  <span className={tryLevel === tl.value ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'}>{tl.icon}</span>
                  <span className="text-[10px] font-medium">{tl.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-2 mb-5">
              {ABORT_REASONS.map((ar) => (
                <button key={ar.value} onClick={() => setAbortReason(ar.value)}
                  className={`w-full py-2.5 px-4 rounded-xl border text-left text-sm font-medium transition-all active:scale-[0.98]
                    ${abortReason === ar.value ? 'border-[var(--color-error)] bg-[var(--color-error-light)] text-[var(--color-error)]' : 'border-[var(--color-border-light)] hover:border-[var(--color-border)]'}`}>
                  {ar.label}
                </button>
              ))}
            </div>
          )}

          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes (optional)"
            className="w-full border border-[var(--color-border-light)] rounded-xl p-3 text-sm mb-4 resize-none h-20 bg-[var(--color-warm-50)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors" />

          {error && <p className="text-sm text-[var(--color-error)] mb-3">{error}</p>}

          <button onClick={handleSubmit} disabled={!canSubmit || submitting}
            className="w-full py-3 rounded-xl font-semibold text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all">
            {submitting ? 'Submitting...' : 'Submit Feedback'}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
