import { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle } from '@phosphor-icons/react';
import { susSubmit } from '@/lib/api';

const SUS_QUESTIONS = [
  '我愿意经常使用这个系统',
  '我发现这个系统非常复杂',
  '我觉得这个系统很容易使用',
  '我需要他人帮助才能使用这个系统',
  '我发现这个系统里的各功能整合得很好',
  '我觉得这个系统里有太多不一致的地方',
  '我认为大多数人能很快学会使用这个系统',
  '我发现这个系统非常笨拙',
  '使用这个系统让我感到很有信心',
  '在使用这个系统前，我需要学很多东西',
];

interface Props {
  session_id: string;
  onDone: () => void;
}

export function SUSModal({ session_id, onDone }: Props) {
  const [answers, setAnswers] = useState<(number | null)[]>(Array(10).fill(null));
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const answered = answers.filter(a => a !== null).length;
  const allAnswered = answered === 10;

  const handleSubmit = async () => {
    if (!allAnswered) return;
    setSubmitting(true);
    try { await susSubmit({ session_id, answers: answers as number[] }); } catch { /* best-effort */ }
    setDone(true);
    setTimeout(onDone, 1200);
  };

  if (done) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-foreground)]/30 backdrop-blur-sm">
      <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
        className="bg-[var(--color-surface)] rounded-2xl p-8 text-center">
        <CheckCircle size={48} weight="fill" className="text-[var(--color-accent)] mx-auto mb-3" />
        <p className="font-semibold">感谢你的反馈！</p>
      </motion.div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-foreground)]/30 backdrop-blur-sm px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        className="bg-[var(--color-surface)] rounded-2xl p-6 max-w-md w-full border border-[var(--color-border-light)] max-h-[90vh] overflow-y-auto"
        style={{ boxShadow: '0 20px 40px -15px rgba(0,0,0,0.1)' }}
      >
        <h2 className="text-lg font-semibold tracking-tight mb-1">使用体验评价</h2>
        <p className="text-xs text-[var(--color-muted)] mb-5">共 10 题，1 = 非常不同意，5 = 非常同意</p>

        <div className="space-y-5">
          {SUS_QUESTIONS.map((q, i) => (
            <div key={i}>
              <p className="text-sm mb-2">
                <span className="font-medium text-[var(--color-muted)]">{i + 1}. </span>{q}
              </p>
              <div className="flex gap-1.5">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} type="button"
                    onClick={() => setAnswers(prev => { const a = [...prev]; a[i] = n; return a; })}
                    className={`flex-1 h-9 rounded-xl text-sm font-semibold border transition-all
                      ${answers[i] === n ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]' : 'border-[var(--color-border-light)] hover:border-[var(--color-border)]'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button onClick={handleSubmit} disabled={!allAnswered || submitting}
          className="mt-6 w-full py-3 rounded-xl font-semibold text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-all">
          {submitting ? '提交中...' : `提交（${answered}/10）`}
        </button>
        <button onClick={onDone} type="button"
          className="mt-2 w-full py-2 text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors">
          跳过
        </button>
      </motion.div>
    </div>
  );
}
