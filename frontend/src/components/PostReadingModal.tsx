import { motion, AnimatePresence } from 'framer-motion';
import { FoodLogForm, type FoodLogFormResult } from './FoodLogForm';
import type { TryLevel } from '@/types/story';

export type PostReadingDoneData = {
  feedbackText: string;
  tryLevel: TryLevel | null;
};

interface Props {
  sessionId: string;
  themeFood?: string;
  onDone: (data: PostReadingDoneData) => void;
}

export function PostReadingModal({ sessionId, themeFood, onDone }: Props) {
  function handleDone(result: FoodLogFormResult) {
    onDone({ feedbackText: result.feedbackText, tryLevel: result.tryLevel });
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center px-4"
        style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(6px)' }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.93, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          className="w-full overflow-hidden"
          style={{
            maxWidth: 440,
            background: 'var(--color-surface, white)',
            borderRadius: '2rem',
            boxShadow: '0 32px 80px -12px rgba(0,0,0,0.18), 0 0 0 1px rgba(231,229,228,0.6)',
          }}
        >
          <FoodLogForm
            themeFood={themeFood}
            showTryLevel
            showNotes
            showSkip
            sessionId={sessionId}
            skipBookGeneration
            submitLabel="提交反馈"
            onDone={handleDone}
            onClose={() => handleDone({ feedbackText: '', tryLevel: null })}
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
