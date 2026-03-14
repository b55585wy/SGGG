import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { clearToken, getToken } from '@/lib/auth'
import { getJson, postJson } from '@/lib/ncApi'
import AvatarEditModal from '@/components/AvatarEditModal'
import { useTTS } from '@/hooks/useTTS'
import { buildEmotionAvatarImageSrc, buildBasicAvatarImageSrc, basicAvatarDefaults, type BasicAvatarColor, type BasicAvatarEmotion, type BasicAvatarGender, type BasicAvatarGlasses, type BasicAvatarShirt, type BasicAvatarUnderdress } from '@/lib/basicAvatar'
import {
  ClockCounterClockwise,
  Microphone,
  PaperPlaneTilt,
  BookOpenText,
  ArrowsClockwise,
  CheckCircle,
  SignOut,
  PencilSimple,
  SmileyWink,
  X,
  ForkKnife,
  SlidersHorizontal,
  GameController,
  Compass,
  UsersThree,
  Palette,
  CaretDown,
  CaretUp,
} from '@phosphor-icons/react'

// ─── Types ───────────────────────────────────────────────────────────────────

type HomeStatusResponse = {
  avatar: {
    nickname: string
    gender: BasicAvatarGender
    color: BasicAvatarColor
    shirt: BasicAvatarShirt
    underdress: BasicAvatarUnderdress
    glasses: BasicAvatarGlasses
    emotion?: BasicAvatarEmotion | null
  }
  feedbackText: string
  themeFood: string
  generating?: boolean
  generatingSince?: string | null
  generatingSlow?: boolean
  generationError?: string | null
  book: {
    bookID: string
    title: string
    preview: string
    description: string
    confirmed: boolean
    regenerateCount: number
  } | null
}

type FoodLogResponse = {
  ok: boolean
  feedbackText: string
  expression: string
  score: number
  emotion?: BasicAvatarEmotion
}

type VoiceResponse = { text: string }

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreColor(s: number): string {
  if (s <= 3) return '#e11d48'
  if (s <= 6) return '#f59e0b'
  return '#059669'
}

function scoreLabel(s: number): string {
  if (s <= 2) return '完全拒绝'
  if (s <= 4) return '不太喜欢'
  if (s <= 6) return '还行'
  if (s <= 8) return '比较喜欢'
  return '非常喜欢'
}

function normalizePreview(preview: string | null | undefined): string | null {
  if (!preview) return null
  const trimmed = preview.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('data:')) return trimmed
  if (trimmed.startsWith('<svg')) {
    return `data:image/svg+xml;utf8,${encodeURIComponent(trimmed)}`
  }
  return trimmed
}

function feedbackFontSize(text: string): number {
  const len = text.trim().length
  if (len <= 40) return 14
  if (len <= 55) return 13
  if (len <= 70) return 12
  if (len <= 85) return 11
  return 10
}

function audioExtFromMime(mime: string): string {
  const normalized = mime.toLowerCase().split(';')[0].trim()
  if (!normalized) return 'webm'
  if (normalized === 'audio/webm') return 'webm'
  if (normalized === 'audio/mp4' || normalized === 'audio/x-m4a') return 'm4a'
  if (normalized === 'audio/mpeg' || normalized === 'audio/mp3' || normalized === 'audio/mpga') return 'mp3'
  if (normalized === 'audio/wav' || normalized === 'audio/x-wav' || normalized === 'audio/wave') return 'wav'
  if (normalized === 'audio/ogg') return 'ogg'
  if (normalized === 'audio/flac') return 'flac'
  if (normalized === 'audio/aiff') return 'aiff'
  return 'webm'
}

function chooseRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return undefined
  }
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ]
  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate
  }
  return undefined
}

function buildRecordingFilename(blob: Blob): string {
  return `recording.${audioExtFromMime(blob.type || '')}`
}

// ─── Regen Modal ─────────────────────────────────────────────────────────────

const REASONS = [
  { value: 'too_long',            label: '太长了' },
  { value: 'too_short',           label: '太短了' },
  { value: 'too_scary',           label: '太恐怖了' },
  { value: 'too_preachy',         label: '太说教了' },
  { value: 'not_cute',            label: '不够可爱' },
  { value: 'style_inconsistent',  label: '风格不统一' },
  { value: 'interaction_unclear', label: '互动不清晰' },
  { value: 'repetitive',          label: '内容重复' },
  { value: 'wrong_age_level',     label: '年龄不符合' },
  { value: 'other',               label: '其他' },
]

const STORY_TYPES = [
  { value: 'curious_discovery', label: '好奇发现', Icon: GameController },
  { value: 'everyday_routine',  label: '日常小事', Icon: Compass },
  { value: 'light_fantasy',     label: '轻趣幻想', Icon: UsersThree },
  { value: 'journey_discovery', label: '奇妙探索', Icon: Palette },
]

const spring = { type: 'spring' as const, stiffness: 120, damping: 22 }
const reasonVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
}
const reasonItem = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: spring },
}

type RegenModalProps = {
  themeFood: string
  regenerateCount: number
  onClose: () => void
  onSuccess: () => void
}

function RegenModal({ themeFood, regenerateCount, onClose, onSuccess }: RegenModalProps) {
  const [reason, setReason] = useState('')
  const [foodOverride, setFoodOverride] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [storyType, setStoryType] = useState('light_fantasy')
  const [storyTypeTouched, setStoryTypeTouched] = useState(false)
  const [difficulty, setDifficulty] = useState('medium')
  const [pages, setPages] = useState(12)
  const [interactionDensity, setInteractionDensity] = useState('medium')
  const [difficultyTouched, setDifficultyTouched] = useState(false)
  const [pagesTouched, setPagesTouched] = useState(false)
  const [interactionDensityTouched, setInteractionDensityTouched] = useState(false)

  const reachedLimit = regenerateCount >= 2
  const canSubmit = !reachedLimit

  function onSubmit() {
    // Close immediately — fire API in background
    onSuccess()
    const payload: Record<string, unknown> = {
      reason: reason || undefined,
      target_food: foodOverride.trim() || undefined,
    }
    if (storyTypeTouched) payload.story_type = storyType
    if (difficultyTouched) payload.difficulty = difficulty
    if (pagesTouched) payload.pages = pages
    if (interactionDensityTouched) payload.interaction_density = interactionDensity
    postJson('/api/book/regenerate', payload).catch(() => { /* silently handle */ })
  }

  return (
    <>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(6px)' }}
        onClick={onClose}
      />

      {/* Centered floating card */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none">
        <motion.div
          key="dialog"
          initial={{ opacity: 0, scale: 0.93, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.93, y: -10 }}
          transition={spring}
          className="pointer-events-auto flex flex-col w-full"
          style={{
            maxWidth: 520,
            maxHeight: '80dvh',
            background: 'white',
            borderRadius: '2rem',
            boxShadow: '0 32px 80px -12px rgba(0,0,0,0.18), 0 0 0 1px rgba(231,229,228,0.6)',
          }}
        >
          {/* Header */}
          <div
            className="shrink-0 flex items-center justify-between px-6 pt-5 pb-4 border-b"
            style={{ borderColor: 'var(--color-border-light)' }}
          >
            <div>
              <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--color-foreground)' }}>
                重新生成
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                已使用 <span className="font-mono font-semibold">{regenerateCount}</span>/2 次
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full transition-all active:scale-[0.93]"
              style={{
                background: 'var(--color-warm-100)',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-muted)',
              }}
            >
              <X size={15} weight="bold" />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">

            {/* Story type (required) */}
            <section>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-xs font-mono font-semibold" style={{ color: 'var(--color-accent)' }}>01</span>
                <span className="text-sm font-bold tracking-tight" style={{ color: 'var(--color-foreground)' }}>故事类型</span>
                <span className="text-xs ml-auto" style={{ color: 'var(--color-muted)' }}>可选</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {STORY_TYPES.map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => { setStoryType(value); setStoryTypeTouched(true) }}
                    className="flex items-center gap-2 py-2.5 px-3 rounded-2xl text-sm font-medium border transition-colors text-left"
                    style={
                      storyType === value
                        ? { borderColor: 'var(--color-accent)', background: 'var(--color-accent-light)', color: 'var(--color-accent)' }
                        : { borderColor: 'var(--color-border-light)', background: '#fafaf9', color: 'var(--color-foreground)' }
                    }
                  >
                    <Icon size={14} weight="duotone" />
                    {label}
                  </button>
                ))}
              </div>
            </section>

            {/* Food override (optional) */}
            <section>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-xs font-mono font-semibold" style={{ color: 'var(--color-accent)' }}>02</span>
                <span className="text-sm font-bold tracking-tight" style={{ color: 'var(--color-foreground)' }}>临时换个食物</span>
                {themeFood && (
                  <span className="text-xs ml-auto px-2 py-0.5 rounded-full font-mono" style={{ color: 'var(--color-muted)', background: 'var(--color-warm-100)', border: '1px solid var(--color-border-light)' }}>
                    当前 {themeFood}
                  </span>
                )}
              </div>
              <div className="relative">
                <ForkKnife size={14} weight="duotone" className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-muted)' }} />
                <input
                  value={foodOverride}
                  onChange={(e) => setFoodOverride(e.target.value)}
                  placeholder={themeFood ? `换掉"${themeFood}"，仅此次生效` : '输入食物名称'}
                  className="form-input"
                  style={{ paddingLeft: 32 }}
                />
              </div>
            </section>

            {/* Advanced (collapsible) */}
            <section>
              <button type="button" onClick={() => setShowAdvanced((v: boolean) => !v)} className="flex items-center gap-2 w-full text-left" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <span className="text-xs font-mono font-semibold" style={{ color: 'var(--color-accent)' }}>03</span>
                <SlidersHorizontal size={12} weight="bold" style={{ color: 'var(--color-muted)' }} />
                <span className="text-sm font-bold tracking-tight flex-1" style={{ color: 'var(--color-foreground)' }}>故事设置</span>
                <span className="text-xs" style={{ color: 'var(--color-muted)' }}>可选</span>
                {showAdvanced ? <CaretUp size={11} weight="bold" style={{ color: 'var(--color-muted)' }} /> : <CaretDown size={11} weight="bold" style={{ color: 'var(--color-muted)' }} />}
              </button>
              <div className="mt-2" style={{ borderTop: '1px solid var(--color-border-light)' }} />
              <AnimatePresence>
                {showAdvanced && (
                  <motion.div key="advanced" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={spring} className="overflow-hidden">
                    <div className="pt-3 space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="block text-xs font-medium" style={{ color: 'var(--color-muted)' }}>难度</label>
                          <select value={difficulty} onChange={(e) => { setDifficulty(e.target.value); setDifficultyTouched(true) }} className="form-input">
                            <option value="easy">简单</option>
                            <option value="medium">中等</option>
                            <option value="hard">困难</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-xs font-medium" style={{ color: 'var(--color-muted)' }}>交互密度</label>
                          <select value={interactionDensity} onChange={(e) => { setInteractionDensity(e.target.value); setInteractionDensityTouched(true) }} className="form-input">
                            <option value="low">少</option>
                            <option value="medium">中</option>
                            <option value="high">多</option>
                          </select>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-xs font-medium" style={{ color: 'var(--color-muted)' }}>页数 <span className="font-mono">{pages}</span></label>
                        <input type="range" min={4} max={12} value={pages} onChange={(e) => { setPages(Number(e.target.value)); setPagesTouched(true) }} className="w-full accent-[var(--color-accent)]" />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

            {/* Reason (optional) */}
            <section>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-xs font-mono font-semibold" style={{ color: 'var(--color-accent)' }}>04</span>
                <span className="text-sm font-bold tracking-tight" style={{ color: 'var(--color-foreground)' }}>重新生成原因</span>
                <span className="text-xs ml-auto" style={{ color: 'var(--color-muted)' }}>可选</span>
              </div>
              <motion.div className="grid grid-cols-2 gap-2" variants={reasonVariants} initial="hidden" animate="show">
                {REASONS.map((r) => (
                  <motion.button
                    key={r.value}
                    variants={reasonItem}
                    type="button"
                    onClick={() => setReason(r.value)}
                    whileTap={{ scale: 0.96 }}
                    className="py-2.5 px-3 rounded-2xl text-sm font-medium border transition-colors text-left"
                    style={
                      reason === r.value
                        ? { borderColor: 'var(--color-accent)', background: 'var(--color-accent-light)', color: 'var(--color-accent)' }
                        : { borderColor: 'var(--color-border-light)', background: '#fafaf9', color: 'var(--color-foreground)' }
                    }
                  >
                    {r.label}
                  </motion.button>
                ))}
              </motion.div>
            </section>
          </div>

          {/* Footer */}
          <div className="shrink-0 px-6 py-4 border-t" style={{ borderColor: 'var(--color-border-light)' }}>
            {reachedLimit ? (
              <div className="text-center text-sm py-3 rounded-2xl font-medium" style={{ color: 'var(--color-muted)', background: 'var(--color-warm-100)' }}>
                已达到重新生成上限（2/2）
              </div>
            ) : (
              <button
                type="button"
                onClick={onSubmit}
                disabled={!canSubmit}
                className="w-full py-3.5 rounded-full font-bold text-sm text-white transition-all active:scale-[0.98]"
                style={{
                  background: canSubmit
                    ? 'linear-gradient(135deg, #059669, #047857)'
                    : 'var(--color-muted)',
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  border: 'none',
                  boxShadow: canSubmit ? '0 8px 24px -4px rgba(5,150,105,0.38)' : 'none',
                }}
              >
                提交并重新生成 →
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </>
  )
}

// ─── Inline Food Log ──────────────────────────────────────────────────────────

type InlineFoodLogProps = {
  onSuccess: (data: FoodLogResponse) => void
}

function InlineFoodLog({ onSuccess }: InlineFoodLogProps) {
  const [foodName, setFoodName] = useState('')
  const [specificThing, setSpecificThing] = useState('')
  const [foodVoiceLoading, setFoodVoiceLoading] = useState(false)
  const [foodIsRecording, setFoodIsRecording] = useState(false)
  const [foodAudioUrl, setFoodAudioUrl] = useState<string | null>(null)
  const foodRecorderRef = useRef<MediaRecorder | null>(null)
  const foodStreamRef = useRef<MediaStream | null>(null)
  const foodChunksRef = useRef<Blob[]>([])
  const [score, setScore] = useState(0)
  const [scoreTouched, setScoreTouched] = useState(false)
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [voiceLoading, setVoiceLoading] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const canSend = useMemo(
    () => !!foodName.trim() && !!content.trim() && scoreTouched && score > 0 && !sending,
    [foodName, content, scoreTouched, score, sending],
  )
  const sliderPct = (score / 10) * 100
  const thumbColor = score > 0 ? scoreColor(score) : undefined

  async function onSend() {
    setError('')
    if (!foodName.trim()) { setError('请输入今日食物'); return }
    if (!scoreTouched || score <= 0) { setError('请先滑动评分条'); return }
    if (!content.trim()) { setError('请输入进食记录'); return }
    setSending(true)
    try {
      const data = await postJson<FoodLogResponse>('/api/food/log', {
        foodName: foodName.trim(),
        specificThing: specificThing.trim() || null,
        score,
        content: content.trim(),
      })
      setFoodName('')
      setSpecificThing('')
      setScore(0)
      setScoreTouched(false)
      setContent('')
      onSuccess(data)
    } catch (e) {
      const message =
        e && typeof e === 'object' && 'message' in e &&
        typeof (e as { message?: unknown }).message === 'string'
          ? (e as { message: string }).message : '提交失败'
      setError(message)
    } finally {
      setSending(false)
    }
  }

  async function transcribeBlob(blob: Blob, target: 'food' | 'content') {
    if (target === 'food') {
      setFoodVoiceLoading(true)
    } else {
      setVoiceLoading(true)
    }
    try {
      const token = getToken()
      const form = new FormData()
      form.append('file', blob, buildRecordingFilename(blob))
      const res = await fetch('/api/user/voice/transcribe', {
        method: 'POST',
        headers: token ? { authorization: `Bearer ${token}` } : undefined,
        body: form,
      })
      if (!res.ok) {
        const msg = await res.text().catch(() => '')
        throw new Error(msg || '语音转写失败')
      }
      const data = await res.json() as VoiceResponse
      if (data.text) {
        if (target === 'food') {
          setFoodName(data.text)
        } else {
          setContent(data.text)
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '语音转写失败')
    } finally {
      if (target === 'food') {
        setFoodVoiceLoading(false)
      } else {
        setVoiceLoading(false)
      }
    }
  }

  async function startRecording(target: 'food' | 'content') {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('当前浏览器不支持录音')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (target === 'food') {
        foodStreamRef.current = stream
        foodChunksRef.current = []
      } else {
        streamRef.current = stream
        chunksRef.current = []
      }
      const preferredMimeType = chooseRecorderMimeType()
      let recorder: MediaRecorder
      try {
        recorder = preferredMimeType
          ? new MediaRecorder(stream, { mimeType: preferredMimeType })
          : new MediaRecorder(stream)
      } catch {
        recorder = new MediaRecorder(stream)
      }
      recorder.ondataavailable = (e) => {
        if (e.data.size <= 0) return
        if (target === 'food') {
          foodChunksRef.current.push(e.data)
        } else {
          chunksRef.current.push(e.data)
        }
      }
      recorder.onstop = async () => {
        const recordedChunks = target === 'food' ? foodChunksRef.current : chunksRef.current
        const chunkMime = recordedChunks.find((c) => c.size > 0 && !!c.type)?.type
        const resolvedMimeType = chunkMime || recorder.mimeType || preferredMimeType || 'audio/webm'
        const blob = new Blob(
          recordedChunks,
          { type: resolvedMimeType },
        )
        if (target === 'food') {
          setFoodAudioUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev)
            return URL.createObjectURL(blob)
          })
        } else {
          setAudioUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev)
            return URL.createObjectURL(blob)
          })
        }
        stream.getTracks().forEach(t => t.stop())
        await transcribeBlob(blob, target)
      }
      if (target === 'food') {
        foodRecorderRef.current = recorder
        setFoodIsRecording(true)
      } else {
        recorderRef.current = recorder
        setIsRecording(true)
      }
      recorder.start()
    } catch {
      setError('无法访问麦克风，请检查浏览器权限')
    }
  }

  function stopRecording(target: 'food' | 'content') {
    const recorder = target === 'food' ? foodRecorderRef.current : recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop()
    }
    if (target === 'food') {
      setFoodIsRecording(false)
    } else {
      setIsRecording(false)
    }
  }

  function onTranscribe(target: 'food' | 'content') {
    if (target === 'food' ? foodVoiceLoading : voiceLoading) return
    const recording = target === 'food' ? foodIsRecording : isRecording
    if (recording) {
      stopRecording(target)
    } else {
      void startRecording(target)
    }
  }

  return (
    <>
      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-y-auto px-8 py-6 space-y-6" style={{ scrollbarWidth: 'none' }}>

        {/* Food name */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>今日食物</label>
          <div className="flex gap-2">
            <input
              value={foodName}
              onChange={(e) => setFoodName(e.target.value)}
              placeholder="请输入今日尝试的食物"
              className="form-input flex-1 text-sm"
            />
            <button
              type="button"
              onClick={() => onTranscribe('food')}
              disabled={foodVoiceLoading}
              className="shrink-0 flex items-center justify-center rounded-2xl border w-12 self-stretch transition-all active:scale-[0.95] disabled:opacity-50"
              style={{ borderColor: 'var(--color-border-light)', background: '#fafaf9', color: 'var(--color-foreground)' }}
            >
              <Microphone size={18} weight={foodIsRecording || foodVoiceLoading ? 'fill' : 'regular'} />
            </button>
          </div>
          {foodAudioUrl && (
            <audio controls src={foodAudioUrl} className="w-full h-8" />
          )}
        </div>

        {/* Specific thing */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>特定事物（可选）</label>
          <input
            value={specificThing}
            onChange={(e) => setSpecificThing(e.target.value)}
            placeholder="例如：绿色豆荚、脆脆的边缘、小颗粒感"
            className="form-input w-full text-sm"
          />
        </div>

        {/* Score section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>喜欢程度</label>
            <div className="flex items-baseline gap-0.5">
              <span
                className="text-xl font-black tabular-nums leading-none transition-colors"
                style={{ color: score > 0 ? scoreColor(score) : 'var(--color-muted)' }}
              >
                {score > 0 ? score : '–'}
              </span>
              <span className="text-xs ml-0.5" style={{ color: 'var(--color-muted)' }}>/10</span>
              {scoreTouched && score > 0 && (
                <span
                  className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full text-white"
                  style={{ background: scoreColor(score) }}
                >
                  {scoreLabel(score)}
                </span>
              )}
            </div>
          </div>
          <input
            type="range" min={0} max={10} value={score}
            onChange={(e) => { setScore(Number(e.target.value)); setScoreTouched(true) }}
            className="range-accent w-full"
            style={{
              background: score > 0
                ? `linear-gradient(to right, ${scoreColor(score)} 0%, ${scoreColor(score)} ${sliderPct}%, var(--color-warm-200) ${sliderPct}%, var(--color-warm-200) 100%)`
                : undefined,
              ['--range-thumb-color' as string]: thumbColor,
            }}
          />
        </div>

        {/* Text + voice */}
        <div className="space-y-1.5">
          <label className="text-sm font-semibold" style={{ color: 'var(--color-muted)' }}>进食过程描述</label>
          <div className="flex gap-2">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="描述一下进食过程，比如吃了多少、有没有困难…"
              className="form-input flex-1 resize-none text-sm"
              rows={5}
            />
            <button
              type="button"
              onClick={() => onTranscribe('content')}
              disabled={voiceLoading}
              className="shrink-0 flex items-center justify-center rounded-2xl border w-12 self-stretch transition-all active:scale-[0.95] disabled:opacity-50"
              style={{ borderColor: 'var(--color-border-light)', background: '#fafaf9', color: 'var(--color-foreground)' }}
            >
              <Microphone size={18} weight={isRecording || voiceLoading ? 'fill' : 'regular'} />
            </button>
          </div>
          {audioUrl && (
            <audio controls src={audioUrl} className="w-full h-8" />
          )}
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm" style={{ color: 'var(--color-error)' }}>{error}</p>
        )}
      </div>

      {/* Fixed footer */}
      <div className="shrink-0 px-8 py-5" style={{ borderTop: '1px solid var(--color-border-light)' }}>
        <button
          type="button"
          onClick={onSend}
          disabled={!canSend}
          className="w-full py-4 rounded-full font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          style={{
            background: canSend ? 'linear-gradient(135deg, #059669, #047857)' : 'var(--color-warm-100)',
            color: canSend ? 'white' : 'var(--color-muted)',
            cursor: canSend ? 'pointer' : 'not-allowed',
            border: 'none',
            boxShadow: canSend ? '0 8px 24px -4px rgba(5,150,105,0.38)' : 'none',
          }}
        >
          <PaperPlaneTilt size={15} weight="bold" />
          {sending ? '提交中...' : '提交记录'}
        </button>
      </div>
    </>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div
      className="h-[100dvh] overflow-hidden flex flex-col"
      style={{ background: 'linear-gradient(145deg, #ecfdf5 0%, #f8faf9 55%, #fafaf9 100%)' }}
    >
      {/* Header */}
      <div
        className="shrink-0 h-14 flex items-center justify-between px-6"
        style={{ background: 'rgba(236,253,245,0.85)', borderBottom: '1px solid rgba(5,150,105,0.1)' }}
      >
        <div className="h-5 w-44 rounded-full skeleton-shimmer" />
        <div className="flex gap-2">
          <div className="h-8 w-28 rounded-full skeleton-shimmer" />
          <div className="h-8 w-28 rounded-full skeleton-shimmer" />
          <div className="h-8 w-8 rounded-full skeleton-shimmer" />
        </div>
      </div>
      {/* Content */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-3 lg:gap-4 p-3 lg:p-4 lg:pt-3">
        <div className="w-full lg:w-[28%] xl:w-[30%] h-48 lg:h-auto rounded-[2rem] lg:rounded-[2.5rem] shrink-0 skeleton-shimmer" />
        <div className="flex-1 rounded-[2rem] skeleton-shimmer" />
      </div>
    </div>
  )
}

// ─── HomePage ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const navigate = useNavigate()
  const tts = useTTS()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<HomeStatusResponse | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [showRegenModal, setShowRegenModal] = useState(false)
  const [showAvatarModal, setShowAvatarModal] = useState(false)
  const [showFoodLogPanel, setShowFoodLogPanel] = useState(false)
  const [bookGenerating, setBookGenerating] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const statusUrl = useMemo(() => (showFoodLogPanel ? '/api/home/status' : '/api/home/status?ensureBook=1'), [showFoodLogPanel])

  const loadStatus = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const data = await getJson<HomeStatusResponse>(statusUrl)
      if (data.generationError) {
        setStatus(data)
        setBookGenerating(false)
        setError(`生成失败：${data.generationError}。请截图此错误信息联系管理员。`)
        return
      }
      // Restore generating state from server (survives page refresh).
      // While generating, clear any stale book so the animation shows correctly.
      if (data.generating) {
        setStatus((prev: HomeStatusResponse | null) => prev ? ({ ...prev, ...data, book: null } as HomeStatusResponse) : ({ ...data, book: null } as HomeStatusResponse))
      } else {
        setStatus(data)
      }
      setBookGenerating(!!data.generating)
    } catch (e) {
      if (e && typeof e === 'object' && 'status' in e) {
        const statusCode = (e as { status?: number }).status
        if (statusCode === 401) {
          clearToken()
          navigate('/noa/login', { replace: true })
          return
        }
      }
      const message =
        e && typeof e === 'object' && 'message' in e &&
        typeof (e as { message?: unknown }).message === 'string'
          ? (e as { message: string }).message : '加载失败'
      if (message === '未找到虚拟形象') {
        navigate('/noa/avatar', { replace: true })
        return
      }
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [navigate, statusUrl])

  const refreshStatus = useCallback(async () => {
    try {
      const data = await getJson<HomeStatusResponse>(statusUrl)
      if (data.generationError) {
        setStatus(data)
        setBookGenerating(false)
        setError(`生成失败：${data.generationError}。请截图此错误信息联系管理员。`)
        return data
      }
      setStatus(data)
      setBookGenerating(!!data.generating)
      return data
    } catch { return null }
  }, [statusUrl])

  useEffect(() => { void loadStatus() }, [loadStatus])

  useEffect(() => {
    if (!bookGenerating) return
    pollRef.current = setInterval(async () => {
      try {
        const data = await getJson<HomeStatusResponse>(statusUrl)
        // Stop polling once server confirms generation is complete
        if (data.generationError) {
          setStatus(data)
          setBookGenerating(false)
          setError(`生成失败：${data.generationError}。请截图此错误信息联系管理员。`)
          return
        }
        if (!data.generating) {
          setStatus(data)
          setBookGenerating(false)
        }
      } catch { /* ignore */ }
    }, 3000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [bookGenerating, statusUrl])

  useEffect(() => {
    const b = status?.book
    if (!b || bookGenerating) return
    if (!b.preview || !b.preview.startsWith('data:image/svg+xml')) return
    let attempts = 0
    const timer = setInterval(async () => {
      if (++attempts > 60) { clearInterval(timer); return }
      const data = await refreshStatus()
      const nextPreview = data?.book?.preview
      if (nextPreview && !nextPreview.startsWith('data:image/svg+xml')) {
        clearInterval(timer)
      }
    }, 3000)
    return () => clearInterval(timer)
  }, [status?.book?.bookID, status?.book?.preview, bookGenerating, refreshStatus, status])

  useEffect(() => {
    const lastPath = sessionStorage.getItem('lastPath')
    if (lastPath && lastPath !== '/noa/home') {
      sessionStorage.removeItem('homeFeedbackText')
      setFeedbackText('')
      return
    }
    const storedFeedback = sessionStorage.getItem('homeFeedbackText')
    if (storedFeedback) setFeedbackText(storedFeedback)
  }, [])

  async function onConfirmBook() {
    setError('')
    try {
      await postJson('/api/book/confirm', {})
      // 确认后立即开始正式实验
      navigate(`/noa/books/${book!.bookID}?experiment=1`)
    } catch (e) {
      const message =
        e && typeof e === 'object' && 'message' in e &&
        typeof (e as { message?: unknown }).message === 'string'
          ? (e as { message: string }).message : '确认失败'
      setError(message)
    }
  }

  async function onLogout() {
    await postJson('/api/auth/logout', {}).catch(() => {})
    clearToken()
    navigate('/noa/login', { replace: true })
  }

  const avatar = status?.avatar
  const book = status?.book
  const feedbackVoice = avatar?.gender === 'male' ? 'zhishuo' : 'zhimiao'
  const previewSrc = normalizePreview(book?.preview)
  const confirmDisabled = !book || book.confirmed || !previewSrc || previewSrc.startsWith('data:image/svg+xml') || bookGenerating
  const regenerateReached = book ? book.regenerateCount >= 2 : false

  if (loading) return <LoadingSkeleton />

  return (
    <div
      className="h-[100dvh] overflow-hidden flex flex-col relative"
      style={{ background: 'linear-gradient(145deg, #ecfdf5 0%, #f8faf9 55%, #fafaf9 100%)' }}
    >
      {/* ── Decorative blobs ── */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: -100, right: -100, width: 500, height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(5,150,105,0.05) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: -120, left: '20%', width: 600, height: 600,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(5,150,105,0.03) 0%, transparent 70%)',
        }}
      />

      {/* ── Header ── */}
      <header
        className="relative z-10 shrink-0 h-14 flex items-center justify-between px-6 gap-4"
        style={{
          background: 'rgba(236,253,245,0.85)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(5,150,105,0.1)',
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <h1 className="font-bold text-base tracking-tight truncate" style={{ color: 'var(--color-foreground)' }}>
            {avatar?.nickname ? `${avatar.nickname}，你好 👋` : '主页面'}
          </h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowFoodLogPanel((prev: boolean) => !prev)}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold border transition-all active:scale-[0.97]"
            style={{
              borderColor: 'var(--color-accent)',
              background: 'var(--color-accent-light)',
              color: 'var(--color-accent)',
            }}
          >
            <ForkKnife size={13} weight="bold" />
            {showFoodLogPanel ? '查看绘本' : '记录进食'}
          </button>
          <button
            onClick={() => navigate('/noa/books/history')}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold border transition-all active:scale-[0.97]"
            style={{
              borderColor: 'var(--color-border-light)',
              background: 'white',
              color: 'var(--color-foreground)',
            }}
          >
            <ClockCounterClockwise size={14} weight="bold" />
            历史绘本
          </button>
          <button
            onClick={onLogout}
            className="flex h-9 w-9 items-center justify-center rounded-full border transition-all active:scale-[0.97]"
            style={{
              borderColor: 'var(--color-border-light)',
              background: 'white',
              color: 'var(--color-muted)',
            }}
            title="退出登录"
          >
            <SignOut size={16} weight="bold" />
          </button>
        </div>
      </header>

      {error && (
        <div className="relative z-10 px-6 pt-3 text-sm" style={{ color: 'var(--color-error)' }}>
          {error}
        </div>
      )}
      {!error && bookGenerating && status?.generatingSlow && (
        <div className="relative z-10 px-6 pt-3 text-sm" style={{ color: 'var(--color-muted)' }}>
          生成时间较长，请保持页面打开继续等待；如等待过久，请截图并联系管理员。
        </div>
      )}

      {/* ── Main 2-column layout ── */}
      <div className="relative z-10 flex-1 min-h-0 flex flex-col lg:flex-row gap-3 lg:gap-4 p-3 lg:p-4 lg:pt-3">

        {/* ── Left: Avatar card (full height) ── */}
        <motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={spring}
          className="w-full lg:w-[28%] xl:w-[30%] h-48 lg:h-auto relative overflow-hidden rounded-[2rem] lg:rounded-[2.5rem] flex flex-col shrink-0"
          style={{
            background: 'white',
            boxShadow: '0 24px 56px -12px rgba(0,0,0,0.09), 0 0 0 1px rgba(5,150,105,0.08)',
          }}
        >
          {/* Inner gradient */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(160deg, #ecfdf5 0%, #f0fdf4 35%, #ffffff 70%)' }}
          />

          {/* Avatar layers */}
          <div className="relative flex-1 min-h-0">
            {feedbackText && (
              <button
                type="button"
                onClick={() => {
                  if (!tts.isSupported) return
                  if (tts.isSpeaking) { tts.stop(); return }
                  void tts.speak(feedbackText, feedbackVoice)
                }}
                className="absolute z-20 left-1/2 -translate-x-1/2 top-4 w-[min(92%,320px)] text-left transition-all active:scale-[0.98]"
                style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
              >
                <div
                  className="relative rounded-[1.25rem] px-4 py-3"
                  style={{
                    background: 'linear-gradient(135deg, rgba(5,150,105,0.96), rgba(4,120,87,0.96))',
                    backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(255,255,255,0.22)',
                    boxShadow: '0 22px 44px -18px rgba(5,150,105,0.55)',
                  }}
                >
                  <p
                    className="font-semibold leading-relaxed"
                    style={{ color: 'rgba(255,255,255,0.98)', fontSize: feedbackFontSize(feedbackText) }}
                  >
                    {feedbackText}
                  </p>
                  <div
                    className="absolute -bottom-2 left-1/2 -translate-x-1/2"
                    style={{
                      width: 0,
                      height: 0,
                      borderLeft: '9px solid transparent',
                      borderRight: '9px solid transparent',
                      borderTop: '10px solid rgba(4,120,87,0.96)',
                      filter: 'drop-shadow(0 10px 14px rgba(5,150,105,0.28))',
                    }}
                  />
                </div>
              </button>
            )}
            {(() => {
              const combo = {
                gender: avatar?.gender ?? basicAvatarDefaults.gender,
                color: avatar?.color ?? basicAvatarDefaults.color,
                shirt: avatar?.shirt ?? basicAvatarDefaults.shirt,
                underdress: avatar?.underdress ?? basicAvatarDefaults.underdress,
                glasses: avatar?.glasses ?? basicAvatarDefaults.glasses,
              }
              const emotion = avatar?.emotion
              const src = typeof emotion === 'number'
                ? buildEmotionAvatarImageSrc(combo, emotion)
                : buildBasicAvatarImageSrc(combo)
              return (
                <img
                  src={src}
                  alt=""
                  className="absolute inset-0 w-full h-full object-contain"
                  onError={(e) => {
                    const el = e.currentTarget
                    const fallback = buildBasicAvatarImageSrc(combo)
                    if (el.src.endsWith(fallback)) return
                    el.src = fallback
                  }}
                />
              )
            })()}
          </div>

          {/* Avatar info + feedback bubble */}
          <div className="relative z-10 shrink-0 px-5 pb-5">
            {/* Name row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SmileyWink size={15} weight="fill" style={{ color: 'var(--color-accent)' }} />
                <span className="text-sm font-bold" style={{ color: 'var(--color-foreground)' }}>
                  {avatar?.nickname || '我的形象'}
                </span>
              </div>
              <button
                onClick={() => setShowAvatarModal(true)}
                className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold border transition-all active:scale-[0.97]"
                style={{
                  borderColor: 'var(--color-border-light)',
                  background: 'white',
                  color: 'var(--color-muted)',
                }}
              >
                <PencilSimple size={10} weight="bold" />
                编辑
              </button>
            </div>
          </div>
        </motion.div>

        {/* ── Right: conditional two-state panel ── */}
        <AnimatePresence mode="wait">
          {!showFoodLogPanel ? (

            /* ── State B: Book card ── */
            <motion.div
              key="state-b"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={spring}
              className="flex-1 min-h-0 rounded-[2rem] overflow-hidden flex"
              style={{
                background: 'white',
                boxShadow: '0 8px 28px -8px rgba(0,0,0,0.06), 0 0 0 1px rgba(231,229,228,0.6)',
              }}
            >
              {/* Book cover thumbnail */}
              <div
                className="w-[35%] lg:w-[38%] relative shrink-0 overflow-hidden flex items-center justify-center p-4 lg:p-5"
                style={{
                  background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                  borderRight: '1px solid rgba(231,229,228,0.4)',
                  cursor: book ? 'pointer' : 'default',
                }}
                onClick={() => book && navigate(`/noa/books/${book.bookID}`)}
              >
                {bookGenerating && !book ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <div className="book-gen-shimmer absolute inset-0" />
                    <div
                      className="book-gen-breathe flex h-12 w-12 items-center justify-center rounded-2xl relative"
                      style={{ background: 'rgba(255,255,255,0.9)', boxShadow: '0 4px 16px rgba(5,150,105,0.15)' }}
                    >
                      <BookOpenText size={24} weight="light" style={{ color: 'var(--color-accent)' }} />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="book-gen-dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--color-accent)', opacity: 0.7, animationDelay: '0ms' }} />
                      <span className="book-gen-dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--color-accent)', opacity: 0.7, animationDelay: '200ms' }} />
                      <span className="book-gen-dot h-1.5 w-1.5 rounded-full" style={{ background: 'var(--color-accent)', opacity: 0.7, animationDelay: '400ms' }} />
                    </div>
                  </div>
                ) : previewSrc ? (
                  <>
                    <div
                      className="relative h-full max-h-[96%] aspect-[3/4] w-auto rounded-[1.25rem] overflow-hidden"
                      style={{ boxShadow: '0 12px 26px rgba(15,23,42,0.18)' }}
                    >
                      <img
                        src={previewSrc}
                        alt={book?.title ?? ''}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{ background: 'linear-gradient(to right, transparent 62%, rgba(255,255,255,0.14))' }}
                      />
                      {book?.confirmed && (
                        <span
                          className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold text-white"
                          style={{ background: 'var(--color-accent)', boxShadow: '0 2px 8px rgba(5,150,105,0.4)' }}
                        >
                          <CheckCircle size={9} weight="fill" />
                          已确认
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                    <div
                      className="flex h-14 w-14 items-center justify-center rounded-2xl"
                      style={{ background: 'rgba(255,255,255,0.7)', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
                    >
                      <BookOpenText size={28} weight="light" style={{ color: 'var(--color-accent)', opacity: 0.7 }} />
                    </div>
                  <span className="text-[11px] font-medium text-center px-4" style={{ color: 'var(--color-muted)' }}>
                      暂无绘本
                    </span>
                  </div>
                )}
              </div>

              {/* Book info */}
              <div className="flex-1 min-w-0 flex flex-col">

                {/* Fixed header */}
                <div className="shrink-0 px-4 lg:px-6 pt-5 lg:pt-6 pb-4 lg:pb-5" style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <div
                      className="flex items-center justify-center shrink-0"
                      style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--color-accent-light)' }}
                    >
                      <BookOpenText size={11} weight="fill" style={{ color: 'var(--color-accent)' }} />
                    </div>
                    <span className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--color-accent)' }}>
                      当前绘本
                    </span>
                  </div>
                  {bookGenerating && !book ? (
                    <div className="space-y-2 mt-1">
                      <div className="h-5 w-36 rounded skeleton-shimmer" />
                      <div className="h-3.5 w-full rounded skeleton-shimmer" />
                    </div>
                  ) : (
                    <h2 className="text-lg lg:text-xl font-black tracking-tight line-clamp-2 mt-1" style={{ color: 'var(--color-foreground)' }}>
                      {book?.title || '绘本生成中…'}
                    </h2>
                  )}
                </div>

                {/* Scrollable description */}
                <div className="flex-1 min-h-0 overflow-y-auto px-4 lg:px-6 py-4 lg:py-5" style={{ scrollbarWidth: 'none' }}>
                  {bookGenerating && !book ? (
                    <div className="space-y-2">
                      <div className="h-3 w-full rounded skeleton-shimmer" />
                      <div className="h-3 w-5/6 rounded skeleton-shimmer" />
                      <div className="h-3 w-4/6 rounded skeleton-shimmer" />
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed" style={{ color: 'var(--color-muted)' }}>
                      {book?.description || '系统正在为你生成专属绘本，请稍候…'}
                    </p>
                  )}
                </div>

                {/* Fixed action footer */}
                <div className="shrink-0 px-4 lg:px-6 pb-5 lg:pb-6 pt-3 lg:pt-4" style={{ borderTop: '1px solid var(--color-border-light)' }}>
                  {book?.confirmed ? (
                    <button
                      onClick={() => navigate(`/noa/books/${book.bookID}?experiment=1`)}
                      className="w-full py-4 rounded-full font-bold text-sm text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                      style={{
                        background: 'linear-gradient(135deg, #059669, #047857)',
                        border: 'none',
                        boxShadow: '0 8px 24px -4px rgba(5,150,105,0.45)',
                        cursor: 'pointer',
                      }}
                    >
                      <BookOpenText size={16} weight="bold" />
                      开始阅读
                    </button>
                  ) : book && !book.confirmed ? (
                    <div className="space-y-2.5">
                      <button
                        onClick={onConfirmBook}
                        disabled={confirmDisabled}
                        className="w-full py-4 rounded-full font-bold text-sm text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                        style={{
                          background: confirmDisabled ? 'var(--color-warm-200)' : 'linear-gradient(135deg, #059669, #047857)',
                          border: 'none',
                          boxShadow: confirmDisabled ? 'none' : '0 8px 24px -4px rgba(5,150,105,0.45)',
                          cursor: confirmDisabled ? 'not-allowed' : 'pointer',
                          opacity: confirmDisabled ? 0.55 : 1,
                        }}
                      >
                        <CheckCircle size={16} weight="bold" />
                        {previewSrc && previewSrc.startsWith('data:image/svg+xml') ? '插图生成中…' : '确认绘本，开始阅读'}
                      </button>
                      <button
                        onClick={() => setShowRegenModal(true)}
                        disabled={regenerateReached}
                        className="w-full py-3 rounded-full font-bold text-sm border flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
                        style={{
                          borderColor: 'var(--color-border-light)',
                          background: 'white',
                          color: regenerateReached ? 'var(--color-muted)' : 'var(--color-foreground)',
                          cursor: regenerateReached ? 'not-allowed' : 'pointer',
                          opacity: regenerateReached ? 0.4 : 1,
                        }}
                      >
                        <ArrowsClockwise size={14} weight="bold" />
                        重新生成 ({book.regenerateCount}/2)
                      </button>
                    </div>
                  ) : bookGenerating ? (
                    <div
                      className="w-full py-4 rounded-full font-bold text-sm flex items-center justify-center gap-2"
                      style={{ background: 'var(--color-warm-100)', color: 'var(--color-muted)' }}
                    >
                      <BookOpenText size={16} weight="light" />
                      绘本生成中…
                    </div>
                  ) : (
                    <div
                      className="w-full py-4 rounded-full font-bold text-sm flex items-center justify-center gap-2"
                      style={{ background: 'var(--color-warm-100)', color: 'var(--color-muted)' }}
                    >
                      <BookOpenText size={16} weight="light" />
                      暂无绘本
                    </div>
                  )}
                </div>
              </div>
            </motion.div>

          ) : (

            /* ── State A: Food log ── */
            <motion.div
              key="state-a"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={spring}
              className="flex-1 min-h-0 rounded-[2rem] overflow-hidden flex flex-col"
              style={{
                background: 'white',
                boxShadow: '0 8px 28px -8px rgba(0,0,0,0.06), 0 0 0 1px rgba(231,229,228,0.6)',
              }}
            >
              {/* Header */}
              <div className="shrink-0 px-8 pt-7 pb-5" style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <div
                    className="flex items-center justify-center shrink-0"
                    style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--color-accent-light)' }}
                  >
                    <ForkKnife size={11} weight="fill" style={{ color: 'var(--color-accent)' }} />
                  </div>
                  <span className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--color-accent)' }}>
                    进食记录
                  </span>
                </div>
                <h2 className="text-xl font-black tracking-tight" style={{ color: 'var(--color-foreground)' }}>
                  今天吃得怎么样？
                </h2>
                <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
                  记录进食情况，帮助我们了解你的尝试进度
                </p>
              </div>

              {/* Food log content */}
              <InlineFoodLog
                onSuccess={(data) => {
                  setFeedbackText(data.feedbackText)
                  sessionStorage.setItem('homeFeedbackText', data.feedbackText)
                  void refreshStatus()
                }}
              />
            </motion.div>

          )}
        </AnimatePresence>
      </div>

      {/* ── Regen Modal ── */}
      <AnimatePresence>
        {showRegenModal && (
          <RegenModal
            themeFood={status?.themeFood ?? ''}
            regenerateCount={book?.regenerateCount ?? 0}
            onClose={() => setShowRegenModal(false)}
            onSuccess={() => {
              setShowRegenModal(false)
              setStatus((prev: HomeStatusResponse | null) => (prev ? ({ ...prev, book: null } as HomeStatusResponse) : null))
              setBookGenerating(true)
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Avatar Edit Modal ── */}
      <AnimatePresence>
        {showAvatarModal && (
          <AvatarEditModal
            onClose={() => setShowAvatarModal(false)}
            onSaved={() => {
              setShowAvatarModal(false)
              void refreshStatus()
            }}
          />
        )}
      </AnimatePresence>

    </div>
  )
}
