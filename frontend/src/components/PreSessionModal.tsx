import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from '@phosphor-icons/react';

export interface PreSessionAnswers {
  child_state: 'energetic' | 'tired' | 'fussy';
  food_familiarity: 1 | 2 | 3 | 4 | 5;
  is_mealtime: 'at_table' | 'before_meal' | 'other';
}

const CHILD_STATES = [
  { value: 'energetic' as const, label: '精力充沛', emoji: '😄' },
  { value: 'tired'     as const, label: '有点累',   emoji: '😴' },
  { value: 'fussy'     as const, label: '情绪不好', emoji: '😤' },
];

const MEALTIME_OPTIONS = [
  { value: 'at_table'    as const, label: '是，就在饭桌旁' },
  { value: 'before_meal' as const, label: '饭前 10 分钟内' },
  { value: 'other'       as const, label: '其他时间' },
];

interface Props {
  targetFood: string;
  onConfirm: (answers: PreSessionAnswers) => void;
}

export function PreSessionModal({ targetFood, onConfirm }: Props) {
  const [childState, setChildState] = useState<PreSessionAnswers['child_state'] | null>(null);
  const [familiarity, setFamiliarity] = useState<number | null>(null);
  const [mealtime, setMealtime] = useState<PreSessionAnswers['is_mealtime'] | null>(null);

  const canConfirm = childState && familiarity && mealtime;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-foreground)]/30 backdrop-blur-sm px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        className="bg-[var(--color-surface)] rounded-2xl p-7 max-w-sm w-full border border-[var(--color-border-light)]"
        style={{ boxShadow: '0 20px 40px -15px rgba(0,0,0,0.1)' }}
      >
        <h2 className="text-lg font-semibold tracking-tight mb-1">开始前，记录一下</h2>
        <p className="text-xs text-[var(--color-muted)] mb-6">帮助我们了解故事的实际效果（约 20 秒）</p>

        {/* Q1 孩子状态 */}
        <p className="text-sm font-medium mb-2">孩子现在的状态？</p>
        <div className="flex gap-2 mb-5">
          {CHILD_STATES.map(s => (
            <button key={s.value} type="button" onClick={() => setChildState(s.value)}
              className={`flex-1 py-2.5 rounded-xl text-xs font-medium border text-center transition-all
                ${childState === s.value ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]' : 'border-[var(--color-border-light)] hover:border-[var(--color-border)]'}`}>
              <div className="text-xl mb-0.5">{s.emoji}</div>
              <div>{s.label}</div>
            </button>
          ))}
        </div>

        {/* Q2 食物熟悉度 */}
        <p className="text-sm font-medium mb-2">对「{targetFood}」的熟悉程度？</p>
        <div className="flex gap-1.5 mb-1">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} type="button" onClick={() => setFamiliarity(n)}
              className={`flex-1 h-9 rounded-xl text-sm font-semibold border transition-all
                ${familiarity === n ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]' : 'border-[var(--color-border-light)] hover:border-[var(--color-border)]'}`}>
              {n}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-[9px] text-[var(--color-muted)] mb-5 px-0.5">
          <span>完全陌生</span><span>最喜欢</span>
        </div>

        {/* Q3 用餐时间 */}
        <p className="text-sm font-medium mb-2">现在是用餐时间吗？</p>
        <div className="space-y-2 mb-6">
          {MEALTIME_OPTIONS.map(o => (
            <button key={o.value} type="button" onClick={() => setMealtime(o.value)}
              className={`w-full py-2.5 px-4 rounded-xl border text-sm font-medium text-left transition-all
                ${mealtime === o.value ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]' : 'border-[var(--color-border-light)] hover:border-[var(--color-border)]'}`}>
              {o.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => canConfirm && onConfirm({
            child_state: childState!,
            food_familiarity: familiarity as 1 | 2 | 3 | 4 | 5,
            is_mealtime: mealtime!,
          })}
          disabled={!canConfirm}
          className="w-full py-3 rounded-xl font-semibold text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
        >
          开始阅读<ArrowRight size={16} weight="bold" />
        </button>
      </motion.div>
    </div>
  );
}
