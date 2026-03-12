import { useRef, useState, useCallback, useEffect } from 'react';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// 按优先级排列的中文 TTS 声音（macOS / Windows Edge 均有较好音质）
const PREFERRED_ZH_VOICES = [
  'Xiaoxiao',         // Microsoft Edge Neural (最优)
  'Xiaohan',
  'Tingting',         // macOS 系统声音
  'Meijia',
  'Sinji',
];

function pickBestChineseVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices() ?? [];
  for (const name of PREFERRED_ZH_VOICES) {
    const v = voices.find(v => v.name.includes(name));
    if (v) return v;
  }
  return voices.find(v => v.lang.startsWith('zh')) ?? null;
}

export function useTTS() {
  const [isSupported] = useState(() => !!window.speechSynthesis || typeof Audio !== 'undefined');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const zhVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (!window.speechSynthesis && typeof Audio === 'undefined') return;
    // 声音列表可能异步加载，先尝试一次，再监听变化
    zhVoiceRef.current = pickBestChineseVoice();
    window.speechSynthesis.onvoiceschanged = () => {
      zhVoiceRef.current = pickBestChineseVoice();
    };
  }, []);

  const _revokeUrl = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  };
  const _resetCurrentPlayback = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    _revokeUrl();
    window.speechSynthesis?.cancel();
  }, []);

  const stop = useCallback(() => {
    _resetCurrentPlayback();
    setIsSpeaking(false);
  }, [_resetCurrentPlayback]);

  const speak = useCallback(async (text: string, voice = 'zhimiao', onEnd?: () => void) => {
    // 停止当前播放 & 取消进行中的请求
    _resetCurrentPlayback();

    const ac = new AbortController();
    abortRef.current = ac;
    setIsSpeaking(true);

    // 优先使用后端 edge-tts（自然人声）
    try {
      const res = await fetch(`${BASE_URL}/api/v1/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice }),
        signal: ac.signal,
      });
      if (ac.signal.aborted) return;
      if (res.ok) {
        const blob = await res.blob();
        if (ac.signal.aborted) return;
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          setIsSpeaking(false);
          _revokeUrl();
          onEnd?.();
        };
        audio.onerror = () => setIsSpeaking(false);
        await audio.play();
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      // 降级到浏览器 TTS
    }

    // 降级：Web Speech API（尽量选较自然的中文声音）
    if (!window.speechSynthesis) {
      setIsSpeaking(false);
      return;
    }
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'zh-CN';
    utt.rate = 0.85;
    utt.pitch = 1.0;
    if (zhVoiceRef.current) utt.voice = zhVoiceRef.current;
    utt.onend = () => { setIsSpeaking(false); onEnd?.(); };
    utt.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utt);
  }, [_resetCurrentPlayback]);

  const speakFromUrl = useCallback(async (audioUrl: string, onEnd?: () => void) => {
    _resetCurrentPlayback();
    setIsSpeaking(true);

    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    audio.onended = () => {
      setIsSpeaking(false);
      onEnd?.();
    };
    audio.onerror = () => setIsSpeaking(false);

    try {
      await audio.play();
    } catch (e) {
      setIsSpeaking(false);
      throw e;
    }
  }, [_resetCurrentPlayback]);

  // 组件卸载时清理
  useEffect(() => () => {
    _resetCurrentPlayback();
  }, [_resetCurrentPlayback]);

  return { isSupported, isSpeaking, speak, speakFromUrl, stop };
}
