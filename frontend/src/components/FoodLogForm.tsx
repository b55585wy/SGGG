import { useState, useMemo, useRef, useCallback } from 'react';
import { Microphone, MicrophoneSlash, PaperPlaneTilt, X, ForkKnife } from '@phosphor-icons/react';
import { Eye, Flower, Hand, Drop, Cookie, Smiley, Star } from '@phosphor-icons/react';
// framer-motion not needed here — animation handled by parent modal wrappers
import { StarRating } from './StarRating';
import { postJson } from '@/lib/ncApi';
import { feedbackSubmit } from '@/lib/api';
import type { TryLevel } from '@/types/story';

const TRY_LEVELS: { value: TryLevel; label: string; icon: React.ReactNode }[] = [
  { value: 'look',    label: '看了看',   icon: <Eye size={24} weight="light" /> },
  { value: 'smell',   label: '闻了闻',   icon: <Flower size={24} weight="light" /> },
  { value: 'touch',   label: '摸了摸',   icon: <Hand size={24} weight="light" /> },
  { value: 'lick',    label: '舔了舔',   icon: <Drop size={24} weight="light" /> },
  { value: 'bite',    label: '咬一口',   icon: <Cookie size={24} weight="light" /> },
  { value: 'chew',    label: '嚼了嚼',   icon: <Smiley size={24} weight="light" /> },
  { value: 'swallow', label: '吞下去了', icon: <Star size={24} weight="fill" /> },
];

type FoodLogResponse = {
  ok?: boolean;
  feedbackText: string;
  expression?: string;
  score?: number;
};

type VoiceResponse = { text: string };

export type FoodLogFormResult = {
  feedbackText: string;
  tryLevel: TryLevel | null;
  skipped?: boolean;
};

export interface FoodLogFormProps {
  /** Theme food name to display */
  themeFood?: string;
  /** Whether to show try-level picker (post-reading only) */
  showTryLevel?: boolean;
  /** Whether to show notes field (post-reading only) */
  showNotes?: boolean;
  /** Whether to show skip button (post-reading only) */
  showSkip?: boolean;
  /** Session ID for feedback API (post-reading only) */
  sessionId?: string;
  /** Skip book generation on submit */
  skipBookGeneration?: boolean;
  /** Submit button label */
  submitLabel?: string;
  /** Called on successful submit or skip */
  onDone: (result: FoodLogFormResult) => void;
  /** Called when X is clicked — defaults to skip behavior */
  onClose?: () => void;
}

export function FoodLogForm({
  themeFood,
  showTryLevel = false,
  showNotes = false,
  showSkip = false,
  sessionId,
  skipBookGeneration = false,
  submitLabel = '提交记录',
  onDone,
  onClose,
}: FoodLogFormProps) {
  const [tryLevel, setTryLevel] = useState<TryLevel | null>(null);
  const [score, setScore] = useState(0);
  const [content, setContent] = useState('');
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState('');
  const recognitionRef = useRef<any>(null);

  const canSend = useMemo(() => {
    if (showTryLevel && !tryLevel) return false;
    if (score === 0) return false;
    if (!content.trim()) return false;
    if (sending) return false;
    return true;
  }, [showTryLevel, tryLevel, score, content, sending]);

  function handleSkip() {
    // For post-reading: submit feedback (try-level only) if selected, then close
    if (sessionId && tryLevel) {
      feedbackSubmit({
        session_id: sessionId,
        status: 'COMPLETED',
        try_level: tryLevel,
      }).catch(() => { /* best-effort */ });
    }
    onDone({ feedbackText: '', tryLevel, skipped: true });
  }

  function handleClose() {
    if (onClose) {
      onClose();
    } else {
      handleSkip();
    }
  }

  async function handleSubmit() {
    if (!canSend) return;
    setError('');
    setSending(true);
    try {
      // Submit food log
      const payload: Record<string, unknown> = {
        score,
        content: content.trim(),
      };
      if (skipBookGeneration) payload.skipBookGeneration = true;
      const data = await postJson<FoodLogResponse>('/api/food/log', payload);

      // Submit feedback if post-reading
      if (sessionId && tryLevel) {
        await feedbackSubmit({
          session_id: sessionId,
          status: 'COMPLETED',
          try_level: tryLevel,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
        }).catch(() => { /* best-effort */ });
      }

      onDone({ feedbackText: data.feedbackText, tryLevel });
    } catch (e) {
      const message =
        e && typeof e === 'object' && 'message' in e &&
        typeof (e as { message?: unknown }).message === 'string'
          ? (e as { message: string }).message : '提交失败';
      setError(message);
      setSending(false);
    }
  }

  const stopRecognition = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* ignore */ }
      recognitionRef.current = null;
    }
    setRecording(false);
  }, []);

  const toggleVoice = useCallback(() => {
    if (recording) {
      stopRecognition();
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('当前浏览器不支持语音识别，请使用 Chrome 或 Edge');
      return;
    }

    setError('');
    const sr = new SpeechRecognition();
    sr.lang = 'zh-CN';
    sr.continuous = true;
    sr.interimResults = false;
    recognitionRef.current = sr;

    sr.onresult = (event: any) => {
      let text = '';
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) text += event.results[i][0].transcript;
      }
      if (text) {
        setContent((prev) => prev ? `${prev}${text}` : text);
      }
    };
    sr.onerror = () => stopRecognition();
    sr.onend = () => setRecording(false);

    sr.start();
    setRecording(true);
  }, [recording, stopRecognition]);

  return (
    <div className="flex flex-col max-h-[80dvh]">
      {/* Header */}
      <div
        className="shrink-0 flex items-center justify-between px-6 pt-5 pb-4"
        style={{ borderBottom: '1px solid var(--color-border-light)' }}
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div
              className="flex items-center justify-center shrink-0"
              style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--color-accent-light)' }}
            >
              <ForkKnife size={10} weight="fill" style={{ color: 'var(--color-accent)' }} />
            </div>
            <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--color-accent)' }}>
              {themeFood ? `今日食物：${themeFood}` : '进食记录'}
            </span>
          </div>
          <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--color-foreground)' }}>
            用餐怎么样？
          </h2>
        </div>
        <button
          type="button"
          onClick={handleClose}
          className="flex h-8 w-8 items-center justify-center rounded-full transition-all active:scale-[0.93]"
          style={{ background: 'var(--color-warm-100)', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
        >
          <X size={15} weight="bold" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5" style={{ scrollbarWidth: 'none' }}>

        {/* Try Level */}
        {showTryLevel && (
          <div className="space-y-2">
            <label className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>尝试程度</label>
            <div className="grid grid-cols-4 gap-2">
              {TRY_LEVELS.map((tl) => (
                <button
                  key={tl.value}
                  type="button"
                  onClick={() => setTryLevel(tl.value)}
                  className={`flex flex-col items-center gap-1 p-2.5 rounded-xl border transition-all active:scale-[0.98]
                    ${tryLevel === tl.value ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]' : 'border-[var(--color-border-light)] hover:border-[var(--color-border)]'}`}
                >
                  <span className={tryLevel === tl.value ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'}>{tl.icon}</span>
                  <span className="text-[10px] font-medium">{tl.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Star Rating */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>喜欢程度</label>
            {score > 0 && (
              <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--color-accent)' }}>
                {score} / 10
              </span>
            )}
          </div>
          <div className="flex justify-center">
            <StarRating value={score} onChange={setScore} />
          </div>
        </div>

        {/* Text + voice */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>进食描述</label>
          <div className="flex gap-2">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="描述一下吃的情况，比如吃了多少、有没有困难…"
              className="form-input flex-1 resize-none text-sm"
              rows={4}
            />
            <button
              type="button"
              onClick={toggleVoice}
              className="shrink-0 flex items-center justify-center rounded-2xl border w-12 self-stretch transition-all active:scale-[0.95]"
              style={{
                borderColor: recording ? 'var(--color-error)' : 'var(--color-border-light)',
                background: recording ? 'var(--color-error-light)' : '#fafaf9',
                color: recording ? 'var(--color-error)' : 'var(--color-foreground)',
              }}
            >
              {recording
                ? <MicrophoneSlash size={18} weight="fill" />
                : <Microphone size={18} weight="regular" />}
            </button>
          </div>
        </div>

        {/* Notes (optional, post-reading) */}
        {showNotes && (
          <div className="space-y-1.5">
            <label className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>补充说明（可选）</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="其他想说的…"
              className="w-full border border-[var(--color-border-light)] rounded-xl p-3 text-sm resize-none h-16 bg-[var(--color-warm-50)] placeholder:text-[var(--color-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
            />
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-sm" style={{ color: 'var(--color-error)' }}>{error}</p>
        )}
      </div>

      {/* Fixed footer */}
      <div className="shrink-0 px-6 py-4 space-y-2" style={{ borderTop: '1px solid var(--color-border-light)' }}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSend}
          className="w-full py-3.5 rounded-full font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          style={{
            background: canSend ? 'linear-gradient(135deg, #059669, #047857)' : 'var(--color-warm-100)',
            color: canSend ? 'white' : 'var(--color-muted)',
            cursor: canSend ? 'pointer' : 'not-allowed',
            border: 'none',
            boxShadow: canSend ? '0 8px 24px -4px rgba(5,150,105,0.38)' : 'none',
          }}
        >
          <PaperPlaneTilt size={15} weight="bold" />
          {sending ? '提交中...' : submitLabel}
        </button>
        {showSkip && (
          <button
            type="button"
            onClick={handleSkip}
            className="w-full py-2.5 text-sm font-medium transition-all active:scale-[0.98]"
            style={{ color: 'var(--color-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            还没吃，先跳过
          </button>
        )}
      </div>
    </div>
  );
}
