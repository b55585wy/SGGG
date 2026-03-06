import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart } from '@phosphor-icons/react';
import { postJson } from '@/lib/ncApi';

type FoodLogResponse = { feedbackText: string };

interface Props {
  themeFood: string;
  onDone: () => void;
}

function HeartRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  const hearts = [1, 2, 3, 4, 5];

  return (
    <div className="flex gap-2 justify-center py-2">
      {hearts.map((h) => {
        const filled = h <= (hover || value);
        return (
          <button
            key={h}
            type="button"
            onMouseEnter={() => setHover(h)}
            onMouseLeave={() => setHover(0)}
            onClick={() => onChange(h)}
            className="transition-transform active:scale-90"
          >
            <Heart
              size={36}
              weight={filled ? 'fill' : 'light'}
              className={filled ? 'text-rose-500' : hover >= h ? 'text-rose-300' : 'text-gray-300'}
            />
          </button>
        );
      })}
    </div>
  );
}

export function MealReminderModal({ themeFood, onDone }: Props) {
  const [phase, setPhase] = useState<'prompt' | 'log'>('prompt');
  const [hearts, setHearts] = useState(0);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  function handleSkip() {
    localStorage.removeItem('pending_meal_reminder');
    onDone();
  }

  async function handleSubmit() {
    if (hearts === 0) { setError('请先选择评分'); return; }
    if (!content.trim()) { setError('请输入进食记录'); return; }
    setSending(true);
    setError('');
    try {
      await postJson<FoodLogResponse>('/api/food/log', {
        score: hearts * 2,
        content: content.trim(),
        skipBookGeneration: true,
      });
      localStorage.removeItem('pending_meal_reminder');
      onDone();
    } catch (e) {
      const message =
        e && typeof e === 'object' && 'message' in e &&
        typeof (e as { message?: unknown }).message === 'string'
          ? (e as { message: string }).message : '提交失败';
      setError(message);
      setSending(false);
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-foreground)]/30 backdrop-blur-sm px-4"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          className="bg-[var(--color-surface)] rounded-2xl p-6 max-w-sm w-full border border-[var(--color-border-light)]"
          style={{ boxShadow: '0 20px 40px -15px rgba(0,0,0,0.1)' }}
        >
          {phase === 'prompt' ? (
            <>
              <h2 className="text-xl font-semibold tracking-tight mb-2 text-center">
                上次读完有没有试着吃呢？
              </h2>
              {themeFood && (
                <p className="text-sm text-center mb-5" style={{ color: 'var(--color-muted)' }}>
                  今日食物：{themeFood}
                </p>
              )}
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => setPhase('log')}
                  className="w-full py-3 rounded-xl font-semibold text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] active:scale-[0.98] transition-all"
                >
                  记录用餐
                </button>
                <button
                  onClick={handleSkip}
                  className="w-full py-3 rounded-xl font-medium border border-[var(--color-border-light)] hover:bg-[var(--color-warm-50)] active:scale-[0.98] transition-all"
                  style={{ color: 'var(--color-muted)' }}
                >
                  还没吃，先跳过
                </button>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold tracking-tight mb-1 text-center">
                吃得怎么样？
              </h2>
              {themeFood && (
                <p className="text-sm text-center mb-4" style={{ color: 'var(--color-muted)' }}>
                  {themeFood}
                </p>
              )}

              <HeartRating value={hearts} onChange={setHearts} />

              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="简单描述一下吃的情况..."
                className="w-full border border-[var(--color-border-light)] rounded-xl p-3 text-sm mb-4 mt-3 resize-none h-20 bg-[var(--color-warm-50)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
              />

              {error && <p className="text-sm text-[var(--color-error)] mb-3">{error}</p>}

              <div className="flex gap-3">
                <button
                  onClick={() => { setPhase('prompt'); setError(''); }}
                  className="flex-1 py-3 rounded-xl font-medium border border-[var(--color-border-light)] hover:bg-[var(--color-warm-50)] active:scale-[0.98] transition-all"
                  style={{ color: 'var(--color-muted)' }}
                >
                  返回
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={hearts === 0 || !content.trim() || sending}
                  className="flex-1 py-3 rounded-xl font-semibold text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all"
                >
                  {sending ? '提交中...' : '提交'}
                </button>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
