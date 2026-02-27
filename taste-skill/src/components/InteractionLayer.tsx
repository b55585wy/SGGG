import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HandTap,
  ArrowsOutCardinal,
  PersonArmsSpread,
  Microphone,
  CheckCircle,
  Target,
} from '@phosphor-icons/react';
import type { Interaction, BranchChoice } from '@/types/story';

interface Props {
  interaction: Interaction;
  branchChoices: BranchChoice[];
  onInteractionComplete: (eventKey: string, latencyMs: number) => void;
  onBranchSelect: (choiceId: string, nextPageId: string) => void;
}

export function InteractionLayer({
  interaction,
  branchChoices,
  onInteractionComplete,
  onBranchSelect,
}: Props) {
  const mountTimeRef = useRef(Date.now());
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    mountTimeRef.current = Date.now();
    setCompleted(false);
  }, [interaction.event_key]);

  const handleComplete = useCallback(() => {
    if (completed) return;
    setCompleted(true);
    onInteractionComplete(interaction.event_key, Date.now() - mountTimeRef.current);
  }, [completed, interaction.event_key, onInteractionComplete]);

  if (interaction.type === 'none') return null;

  const spring = { type: 'spring' as const, stiffness: 100, damping: 20 };

  if (interaction.type === 'tap') {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="mt-6 flex flex-col items-center gap-3">
        <p className="text-sm text-[var(--color-muted)]">{interaction.instruction}</p>
        <button onClick={handleComplete} disabled={completed}
          className={`w-20 h-20 rounded-full border-2 border-dashed flex items-center justify-center transition-all active:scale-[0.98]
            ${completed ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]' : 'border-[var(--color-accent)] bg-[var(--color-accent-light)]/30 hover:bg-[var(--color-accent-light)]/60'}`}>
          <AnimatePresence mode="wait">
            {completed ? (
              <motion.div key="done" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 15 }}>
                <CheckCircle size={32} weight="fill" className="text-[var(--color-accent)]" />
              </motion.div>
            ) : (
              <motion.div key="tap" animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}>
                <HandTap size={32} weight="light" className="text-[var(--color-accent)]" />
              </motion.div>
            )}
          </AnimatePresence>
        </button>
      </motion.div>
    );
  }

  if (interaction.type === 'choice') {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 space-y-3">
        <p className="text-sm text-[var(--color-muted)] text-center">{interaction.instruction}</p>
        {branchChoices.map((c, i) => (
          <motion.button key={c.choice_id}
            initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
            transition={{ ...spring, delay: i * 0.1 }}
            onClick={() => { handleComplete(); onBranchSelect(c.choice_id, c.next_page_id); }}
            className="w-full py-3 px-4 rounded-xl bg-[var(--color-warm-100)] hover:bg-[var(--color-warm-200)] text-[var(--color-foreground)] font-medium transition-colors active:scale-[0.98] border border-[var(--color-border-light)]">
            {c.label}
          </motion.button>
        ))}
      </motion.div>
    );
  }

  if (interaction.type === 'drag') {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="mt-6 flex flex-col items-center gap-3">
        <p className="text-sm text-[var(--color-muted)]">{interaction.instruction}</p>
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 rounded-xl bg-[var(--color-accent-light)] flex items-center justify-center">
            <ArrowsOutCardinal size={28} weight="light" className="text-[var(--color-accent)]" />
          </div>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--color-muted)]"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          <button onClick={handleComplete} disabled={completed}
            className={`w-16 h-16 rounded-xl border-2 border-dashed flex items-center justify-center transition-all active:scale-[0.98]
              ${completed ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]' : 'border-[var(--color-border)] hover:border-[var(--color-accent)]'}`}>
            {completed ? <CheckCircle size={28} weight="fill" className="text-[var(--color-accent)]" /> : <Target size={28} weight="light" className="text-[var(--color-muted)]" />}
          </button>
        </div>
      </motion.div>
    );
  }

  if (interaction.type === 'mimic') {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="mt-6 flex flex-col items-center gap-3">
        <p className="text-sm text-[var(--color-muted)]">{interaction.instruction}</p>
        <button onClick={handleComplete} disabled={completed}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all active:scale-[0.98]
            ${completed ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]' : 'bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]'}`}>
          {completed ? <><CheckCircle size={20} weight="fill" /><span>Well done</span></> : <><PersonArmsSpread size={20} weight="light" /><span>I did it</span></>}
        </button>
      </motion.div>
    );
  }

  if (interaction.type === 'record_voice') {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="mt-6 flex flex-col items-center gap-3">
        <p className="text-sm text-[var(--color-muted)]">{interaction.instruction}</p>
        <button onClick={handleComplete} disabled={completed}
          className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all active:scale-[0.98]
            ${completed ? 'bg-[var(--color-accent-light)] text-[var(--color-accent)]' : 'bg-[var(--color-error-light)] text-[var(--color-error)] hover:opacity-80'}`}>
          {completed ? <><CheckCircle size={20} weight="fill" /><span>Recorded</span></> : <><Microphone size={20} weight="fill" /><span>Record</span></>}
        </button>
        {!completed && <p className="text-xs text-[var(--color-muted)]">Coming soon</p>}
      </motion.div>
    );
  }

  return null;
}
