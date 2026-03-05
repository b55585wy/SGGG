import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HandTap,
  ArrowsOutCardinal,
  PersonArmsSpread,
  Microphone,
  Stop,
  CheckCircle,
  Target,
} from '@phosphor-icons/react';
import { postJson } from '@/lib/ncApi';
import type { Interaction, BranchChoice } from '@/types/story';

interface Props {
  interaction: Interaction;
  branchChoices: BranchChoice[];
  onInteractionComplete: (eventKey: string, latencyMs: number) => void;
  onBranchSelect: (choiceId: string, nextPageId: string) => void;
  onInteractionStart?: (interactionType: string, eventKey: string) => void;
  speak?: (text: string) => void;
  autoRead?: boolean;
  pageId?: string;
}

// ─── Voice Recorder sub-component ───────────────────────────

type RecordState = 'idle' | 'recording' | 'processing' | 'done' | 'error';

function VoiceRecorder({
  instruction,
  pageId,
  onDone,
}: {
  instruction: string;
  pageId?: string;
  onDone: () => void;
}) {
  const [state, setState] = useState<RecordState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState('');
  const [errMsg, setErrMsg] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recStartRef = useRef(0);
  const liveTranscriptRef = useRef('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const speechRef = useRef<any>(null);

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const startRecording = useCallback(async () => {
    setErrMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      liveTranscriptRef.current = '';
      recStartRef.current = Date.now();

      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '' });
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start(500);
      mediaRecorderRef.current = mr;

      // Optional: Web Speech API for browser-side transcript
      const SpeechRecognition = (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition
        ?? (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
      if (SpeechRecognition) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sr = new (SpeechRecognition as new() => any)();
        sr.lang = 'zh-CN';
        sr.continuous = true;
        sr.interimResults = true;
        sr.onresult = (event: { results: SpeechRecognitionResultList }) => {
          let final = '';
          for (let i = 0; i < event.results.length; i++) {
            if (event.results[i].isFinal) final += event.results[i][0].transcript;
          }
          liveTranscriptRef.current = final;
          setTranscript(final);
        };
        sr.start();
        speechRef.current = sr;
      }

      setState('recording');
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } catch {
      setErrMsg('麦克风访问失败，请检查权限设置。');
    }
  }, []);

  const stopRecording = useCallback(() => {
    stopTimer();
    setState('processing');

    const mr = mediaRecorderRef.current;
    if (speechRef.current) { try { speechRef.current.stop(); } catch { /* ignore */ } speechRef.current = null; }

    if (!mr) { setState('done'); onDone(); return; }

    mr.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
      const durationMs = Date.now() - recStartRef.current;

      // Stop all tracks
      mr.stream.getTracks().forEach(t => t.stop());

      let audioBase64: string | null = null;
      try {
        const buf = await blob.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        bytes.forEach(b => { binary += String.fromCharCode(b); });
        audioBase64 = btoa(binary);
      } catch { /* skip audio if conversion fails */ }

      const bookId = localStorage.getItem('storybook_book_id');
      try {
        await postJson('/api/voice/record', {
          audioData: audioBase64,
          transcript: liveTranscriptRef.current || null,
          source: 'interaction',
          contextId: bookId ?? null,
          pageId: pageId ?? null,
          durationMs,
        });
        setTranscript(liveTranscriptRef.current);
      } catch { /* best-effort */ }

      setState('done');
      onDone();
    };

    mr.stop();
    mediaRecorderRef.current = null;
  }, [pageId, onDone]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimer();
      if (mediaRecorderRef.current) {
        try { mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
      }
      if (speechRef.current) { try { speechRef.current.stop(); } catch { /* ignore */ } }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  if (state === 'done') {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-accent-light)] text-[var(--color-accent)]">
          <CheckCircle size={20} weight="fill" />
          <span className="font-medium">已录音</span>
        </div>
        {transcript && (
          <p className="text-xs text-[var(--color-muted)] text-center max-w-xs italic">「{transcript}」</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-sm text-[var(--color-muted)]">{instruction}</p>

      {state === 'idle' && (
        <button onClick={startRecording}
          className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium bg-[var(--color-error-light)] text-[var(--color-error)] hover:opacity-80 active:scale-[0.98] transition-all">
          <Microphone size={20} weight="fill" />录音
        </button>
      )}

      {state === 'recording' && (
        <div className="flex flex-col items-center gap-2">
          {transcript && (
            <p className="text-xs text-[var(--color-muted)] text-center max-w-xs italic">「{transcript}」</p>
          )}
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-sm text-[var(--color-error)]">
              <motion.span
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ repeat: Infinity, duration: 1.2 }}
                className="w-2 h-2 rounded-full bg-[var(--color-error)] inline-block"
              />
              {fmt(seconds)}
            </span>
            <button onClick={stopRecording}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium bg-[var(--color-error)] text-white hover:opacity-90 active:scale-[0.98] transition-all">
              <Stop size={18} weight="fill" />停止
            </button>
          </div>
        </div>
      )}

      {state === 'processing' && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--color-warm-100)] text-[var(--color-muted)] text-sm">
          <div className="w-4 h-4 border-2 border-[var(--color-muted)]/30 border-t-[var(--color-muted)] rounded-full animate-spin" />
          处理中...
        </div>
      )}

      {errMsg && <p className="text-xs text-[var(--color-error)]">{errMsg}</p>}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────

export function InteractionLayer({
  interaction,
  branchChoices,
  onInteractionComplete,
  onBranchSelect,
  onInteractionStart,
  speak,
  autoRead,
  pageId,
}: Props) {
  const mountTimeRef = useRef(Date.now());
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    mountTimeRef.current = Date.now();
    setCompleted(false);
    if (interaction.type !== 'none') {
      onInteractionStart?.(interaction.type, interaction.event_key);
      // 自动朗读模式下由 Reader 通过 onEnd 串联，无需在此重复触发
      if (!autoRead && speak && interaction.instruction) {
        const timer = setTimeout(() => speak(interaction.instruction), 600);
        return () => clearTimeout(timer);
      }
    }
  }, [interaction.event_key]); // eslint-disable-line react-hooks/exhaustive-deps

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
          {completed ? <><CheckCircle size={20} weight="fill" /><span>太棒了</span></> : <><PersonArmsSpread size={20} weight="light" /><span>我做到了</span></>}
        </button>
      </motion.div>
    );
  }

  if (interaction.type === 'record_voice') {
    return (
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="mt-6">
        <VoiceRecorder
          instruction={interaction.instruction}
          pageId={pageId}
          onDone={handleComplete}
        />
      </motion.div>
    );
  }

  return null;
}
