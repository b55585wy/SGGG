import { useRef, useState, useCallback, useEffect } from 'react';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export function useTTS() {
  const [isSupported, setIsSupported] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!window.speechSynthesis && typeof Audio === 'undefined') {
      setIsSupported(false);
    }
  }, []);

  const _revokeUrl = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  };

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    _revokeUrl();
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(async (text: string, voice = 'zhimiao') => {
    // 停止当前播放
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    _revokeUrl();
    window.speechSynthesis?.cancel();
    setIsSpeaking(true);

    // 优先使用 CosyVoice 云端 TTS
    try {
      const res = await fetch(`${BASE_URL}/api/v1/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          setIsSpeaking(false);
          _revokeUrl();
        };
        audio.onerror = () => setIsSpeaking(false);
        await audio.play();
        return;
      }
    } catch {
      // 降级到浏览器 TTS
    }

    // 降级：Web Speech API
    if (!window.speechSynthesis) {
      setIsSpeaking(false);
      return;
    }
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'zh-CN';
    utt.rate = 0.85;
    utt.pitch = 1.0;
    utt.onend = () => setIsSpeaking(false);
    utt.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utt);
  }, []);

  // 组件卸载时清理
  useEffect(() => () => {
    if (audioRef.current) audioRef.current.pause();
    _revokeUrl();
    window.speechSynthesis?.cancel();
  }, []);

  return { isSupported, isSpeaking, speak, stop };
}
