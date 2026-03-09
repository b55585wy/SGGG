import { motion, AnimatePresence } from 'framer-motion';
import { FoodLogForm, type FoodLogFormResult, type FoodLogFormProps } from './FoodLogForm';
import type { TryLevel } from '@/types/story';

export type PostReadingDoneData = {
  feedbackText: string;
  tryLevel: TryLevel | null;
};

const spring = { type: 'spring' as const, stiffness: 120, damping: 22 };

// ─── Unified Food Log Modal ────────────────────────────────────────────────
// Used by both HomePage (normal food log) and Reader (post-reading feedback).
// Pass FoodLogForm props to control which fields are visible.

export type FoodLogModalProps = Omit<FoodLogFormProps, 'onDone' | 'onClose'> & {
  onDone: (result: FoodLogFormResult) => void;
  onClose: () => void;
};

export function FoodLogModal({ onDone, onClose, ...formProps }: FoodLogModalProps) {
  return (
    <>
      <motion.div
        key="fl-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(6px)' }}
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none">
        <motion.div
          key="fl-dialog"
          initial={{ opacity: 0, scale: 0.93, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.93, y: -10 }}
          transition={spring}
          className="pointer-events-auto w-full overflow-hidden"
          style={{
            maxWidth: 480,
            background: 'white',
            borderRadius: '2rem',
            boxShadow: '0 32px 80px -12px rgba(0,0,0,0.18), 0 0 0 1px rgba(231,229,228,0.6)',
          }}
        >
          <FoodLogForm {...formProps} onDone={onDone} onClose={onClose} />
        </motion.div>
      </div>
    </>
  );
}

// ─── PostReadingModal (convenience wrapper for Reader) ──────────────────────

interface PostReadingProps {
  sessionId: string;
  themeFood?: string;
  onDone: (data: PostReadingDoneData) => void;
}

export function PostReadingModal({ sessionId, themeFood, onDone }: PostReadingProps) {
  function handleDone(result: FoodLogFormResult) {
    onDone({ feedbackText: result.feedbackText, tryLevel: result.tryLevel });
  }
  function handleClose() {
    onDone({ feedbackText: '', tryLevel: null });
  }

  return (
    <AnimatePresence>
      <FoodLogModal
        themeFood={themeFood}
        showTryLevel
        showNotes
        showSkip
        sessionId={sessionId}
        skipBookGeneration
        submitLabel="提交反馈"
        onDone={handleDone}
        onClose={handleClose}
      />
    </AnimatePresence>
  );
}
