import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { clearToken } from '@/lib/auth'
import { getJson, postJson } from '@/lib/ncApi'
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
  Sparkle,
  X,
  ForkKnife,
  PencilLine,
  SlidersHorizontal,
  GameController,
  Compass,
  UsersThree,
  Palette,
  SpinnerGap,
  CaretDown,
  CaretUp,
} from '@phosphor-icons/react'

// ─── Types ───────────────────────────────────────────────────────────────────

type HomeStatusResponse = {
  avatar: {
    nickname: string
    baseImage: string | null
    hairImage: string
    glassesImage: string
    topImage: string
    bottomImage: string
  }
  feedbackText: string
  themeFood: string
  book: {
    bookID: string
    title: string
    preview: string
    description: string
    confirmed: boolean
    regenerateCount: number
  }
}

type FoodLogResponse = {
  ok: boolean
  feedbackText: string
  expression: string
  score: number
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
  { value: 'interactive', label: '互动冒险', Icon: GameController },
  { value: 'adventure',   label: '探险故事', Icon: Compass },
  { value: 'social',      label: '社交故事', Icon: UsersThree },
  { value: 'sensory',     label: '感官体验', Icon: Palette },
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
  const [showHints, setShowHints] = useState(false)
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [storyType, setStoryType] = useState('interactive')
  const [difficulty, setDifficulty] = useState('medium')
  const [pages, setPages] = useState(6)
  const [interactionDensity, setInteractionDensity] = useState('medium')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const reachedLimit = regenerateCount >= 2
  const canSubmit = !submitting && !reachedLimit && reason !== ''

  async function onSubmit() {
    if (!reason) { setError('请选择一个不满意的原因'); return }
    setError('')
    setSubmitting(true)
    try {
      await postJson('/api/book/regenerate', {
        reason,
        target_food: foodOverride.trim() || undefined,
        title: title.trim() || undefined,
        note: note.trim() || undefined,
        story_type: storyType,
        difficulty,
        pages,
        interaction_density: interactionDensity,
      })
      onSuccess()
    } catch (e) {
      const message =
        e && typeof e === 'object' && 'message' in e &&
        typeof (e as { message?: unknown }).message === 'string'
          ? (e as { message: string }).message
          : '提交失败'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        key="sheet"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={spring}
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col"
        style={{
          maxHeight: '92dvh',
          background: 'var(--color-surface)',
          borderRadius: '2rem 2rem 0 0',
          boxShadow: '0 -8px 48px rgba(0,0,0,0.12)',
        }}
      >
        {/* Handle */}
        <div className="flex flex-col items-center pt-3 pb-2 shrink-0">
          <div
            className="h-1 w-10 rounded-full"
            style={{ background: 'var(--color-border)' }}
          />
        </div>

        {/* Header */}
        <div
          className="flex items-center justify-between px-5 pb-3 shrink-0 border-b"
          style={{ borderColor: 'var(--color-border-light)' }}
        >
          <div>
            <h2 className="text-base font-semibold tracking-tight" style={{ color: 'var(--color-foreground)' }}>
              重新生成
            </h2>
            <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
              已使用 <span className="font-mono">{regenerateCount}</span>/2 次
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl transition-colors"
            style={{
              background: 'var(--color-warm-100)',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--color-muted)',
            }}
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">

          {/* ── Reason (required) ── */}
          <section>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-xs font-mono font-medium" style={{ color: 'var(--color-accent)' }}>01</span>
              <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--color-foreground)' }}>
                不满意的原因
              </span>
              <span className="text-xs ml-auto" style={{ color: 'var(--color-error)' }}>必填</span>
            </div>
            <motion.div
              className="grid grid-cols-2 gap-2"
              variants={reasonVariants}
              initial="hidden"
              animate="show"
            >
              {REASONS.map((r) => (
                <motion.button
                  key={r.value}
                  variants={reasonItem}
                  type="button"
                  onClick={() => setReason(r.value)}
                  whileTap={{ scale: 0.97 }}
                  className="py-2.5 px-3 rounded-xl text-sm font-medium border transition-colors text-left"
                  style={
                    reason === r.value
                      ? { borderColor: 'var(--color-accent)', background: 'var(--color-accent-light)', color: 'var(--color-accent)' }
                      : { borderColor: 'var(--color-border)', background: 'var(--color-warm-50)', color: 'var(--color-foreground)' }
                  }
                >
                  {r.label}
                </motion.button>
              ))}
            </motion.div>
          </section>

          {/* ── Food override (optional) ── */}
          <section>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-xs font-mono font-medium" style={{ color: 'var(--color-accent)' }}>02</span>
              <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--color-foreground)' }}>
                临时换个食物
              </span>
              {themeFood && (
                <span
                  className="text-xs ml-auto px-2 py-0.5 rounded-full font-mono"
                  style={{ color: 'var(--color-muted)', background: 'var(--color-warm-100)', border: '1px solid var(--color-border-light)' }}
                >
                  当前 {themeFood}
                </span>
              )}
            </div>
            <div className="relative">
              <ForkKnife
                size={14}
                weight="duotone"
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--color-muted)' }}
              />
              <input
                value={foodOverride}
                onChange={(e) => setFoodOverride(e.target.value)}
                placeholder={themeFood ? `换掉"${themeFood}"，仅此次生效` : '输入食物名称（仅此次生效）'}
                className="form-input"
                style={{ paddingLeft: 32 }}
              />
            </div>
          </section>

          {/* ── Hints (optional, collapsible) ── */}
          <section>
            <button
              type="button"
              onClick={() => setShowHints((v) => !v)}
              className="flex items-center gap-2 w-full text-left"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <span className="text-xs font-mono font-medium" style={{ color: 'var(--color-accent)' }}>03</span>
              <PencilLine size={12} weight="bold" style={{ color: 'var(--color-muted)' }} />
              <span className="text-sm font-semibold tracking-tight flex-1" style={{ color: 'var(--color-foreground)' }}>
                补充说明
              </span>
              <span className="text-xs" style={{ color: 'var(--color-muted)' }}>可选</span>
              {showHints
                ? <CaretUp size={11} weight="bold" style={{ color: 'var(--color-muted)' }} />
                : <CaretDown size={11} weight="bold" style={{ color: 'var(--color-muted)' }} />}
            </button>
            <div className="mt-2" style={{ borderTop: '1px solid var(--color-border-light)' }} />
            <AnimatePresence>
              {showHints && (
                <motion.div
                  key="hints"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={spring}
                  className="overflow-hidden"
                >
                  <div className="pt-3 space-y-3">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium" style={{ color: 'var(--color-muted)' }}>
                        标题建议
                      </label>
                      <input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="给新故事起个名字"
                        className="form-input"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium" style={{ color: 'var(--color-muted)' }}>
                        更多要求
                      </label>
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="描述你希望新故事有什么不同…"
                        rows={2}
                        className="form-input resize-none"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>

          {/* ── Advanced (optional, collapsible) ── */}
          <section>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-2 w-full text-left"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <span className="text-xs font-mono font-medium" style={{ color: 'var(--color-accent)' }}>04</span>
              <SlidersHorizontal size={12} weight="bold" style={{ color: 'var(--color-muted)' }} />
              <span className="text-sm font-semibold tracking-tight flex-1" style={{ color: 'var(--color-foreground)' }}>
                故事设置
              </span>
              <span className="text-xs" style={{ color: 'var(--color-muted)' }}>可选</span>
              {showAdvanced
                ? <CaretUp size={11} weight="bold" style={{ color: 'var(--color-muted)' }} />
                : <CaretDown size={11} weight="bold" style={{ color: 'var(--color-muted)' }} />}
            </button>
            <div className="mt-2" style={{ borderTop: '1px solid var(--color-border-light)' }} />
            <AnimatePresence>
              {showAdvanced && (
                <motion.div
                  key="advanced"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={spring}
                  className="overflow-hidden"
                >
                  <div className="pt-3 space-y-4">
                    <div className="space-y-2">
                      <label className="block text-xs font-medium" style={{ color: 'var(--color-muted)' }}>
                        故事类型
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {STORY_TYPES.map(({ value, label, Icon }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setStoryType(value)}
                            className="flex items-center gap-2 py-2 px-3 rounded-xl text-sm font-medium border transition-colors"
                            style={
                              storyType === value
                                ? { borderColor: 'var(--color-accent)', background: 'var(--color-accent-light)', color: 'var(--color-accent)' }
                                : { borderColor: 'var(--color-border)', background: 'var(--color-warm-50)', color: 'var(--color-foreground)' }
                            }
                          >
                            <Icon size={13} weight="duotone" />
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-medium" style={{ color: 'var(--color-muted)' }}>难度</label>
                        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="form-input">
                          <option value="easy">简单</option>
                          <option value="medium">中等</option>
                          <option value="hard">困难</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-xs font-medium" style={{ color: 'var(--color-muted)' }}>交互密度</label>
                        <select value={interactionDensity} onChange={(e) => setInteractionDensity(e.target.value)} className="form-input">
                          <option value="low">少</option>
                          <option value="medium">中</option>
                          <option value="high">多</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium" style={{ color: 'var(--color-muted)' }}>
                        页数 <span className="font-mono">{pages}</span>
                      </label>
                      <input
                        type="range" min={4} max={12} value={pages}
                        onChange={(e) => setPages(Number(e.target.value))}
                        className="w-full accent-[var(--color-accent)]"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>

        {/* Footer: error + submit */}
        <div
          className="shrink-0 px-5 py-4 border-t space-y-3"
          style={{ borderColor: 'var(--color-border-light)' }}
        >
          <AnimatePresence>
            {error && (
              <motion.p
                key="err"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="text-sm px-3 py-2 rounded-xl"
                style={{ color: 'var(--color-error)', background: 'var(--color-error-light)' }}
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          {reachedLimit ? (
            <div
              className="text-center text-sm py-3 rounded-2xl font-medium"
              style={{ color: 'var(--color-muted)', background: 'var(--color-warm-100)' }}
            >
              已达到重新生成上限（2/2）
            </div>
          ) : (
            <button
              type="button"
              onClick={onSubmit}
              disabled={!canSubmit}
              className="w-full py-4 rounded-2xl font-semibold text-sm text-white transition-all active:-translate-y-[1px]"
              style={{
                background: canSubmit ? 'var(--color-accent)' : 'var(--color-muted)',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                border: 'none',
                boxShadow: canSubmit ? '0 6px 20px -4px rgba(5,150,105,0.35)' : 'none',
              }}
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <SpinnerGap size={15} weight="bold" className="animate-spin" />
                  生成中…
                </span>
              ) : (
                '提交并重新生成'
              )}
            </button>
          )}
        </div>
      </motion.div>
    </>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto max-w-[1200px] px-5 py-4">
        <div className="mb-4 flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-6 w-44 rounded-lg skeleton-shimmer" />
            <div className="h-4 w-28 rounded-md skeleton-shimmer" />
          </div>
          <div className="flex gap-2">
            <div className="h-9 w-9 rounded-xl skeleton-shimmer" />
            <div className="h-9 w-24 rounded-xl skeleton-shimmer" />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[7fr_5fr]">
          <div className="h-[7.5rem] rounded-[2rem] skeleton-shimmer" />
          <div className="h-[7.5rem] rounded-[2rem] skeleton-shimmer" />
          <div className="h-80 rounded-[2rem] skeleton-shimmer" />
          <div className="h-80 rounded-[2rem] skeleton-shimmer" />
        </div>
      </div>
    </div>
  )
}

// ─── HomePage ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<HomeStatusResponse | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [showRegenModal, setShowRegenModal] = useState(false)

  const [score, setScore] = useState(0)
  const [scoreTouched, setScoreTouched] = useState(false)
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [voiceLoading, setVoiceLoading] = useState(false)
  const [bookGenerating, setBookGenerating] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const canSend = useMemo(
    () => !!content.trim() && scoreTouched && score > 0 && !sending,
    [content, scoreTouched, score, sending],
  )

  const loadStatus = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const data = await getJson<HomeStatusResponse>('/api/home/status')
      setStatus(data)
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
  }, [navigate])

  const refreshStatus = useCallback(async () => {
    try {
      const data = await getJson<HomeStatusResponse>('/api/home/status')
      setStatus(data)
      return data
    } catch { return null }
  }, [])

  useEffect(() => { void loadStatus() }, [loadStatus])

  useEffect(() => {
    if (!bookGenerating) return
    pollRef.current = setInterval(async () => {
      const data = await refreshStatus()
      if (data?.book) setBookGenerating(false)
    }, 3000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [bookGenerating, refreshStatus])

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

  async function onSend() {
    setError('')
    if (!scoreTouched || score <= 0) { setError('请先滑动评分条'); return }
    if (!content.trim()) { setError('请输入进食记录'); return }
    setSending(true)
    try {
      const data = await postJson<FoodLogResponse>('/api/food/log', { score, content: content.trim() })
      setFeedbackText(data.feedbackText)
      sessionStorage.setItem('homeFeedbackText', data.feedbackText)
      setContent('')
      setScore(0)
      setScoreTouched(false)
      setBookGenerating(true)
      void refreshStatus()
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

  async function onTranscribe() {
    setError('')
    setVoiceLoading(true)
    try {
      const data = await postJson<VoiceResponse>('/api/voice/transcribe', {})
      setContent(data.text)
    } catch (e) {
      const message =
        e && typeof e === 'object' && 'message' in e &&
        typeof (e as { message?: unknown }).message === 'string'
          ? (e as { message: string }).message : '语音转写失败'
      setError(message)
    } finally {
      setVoiceLoading(false)
    }
  }

  async function onConfirmBook() {
    setError('')
    try {
      await postJson('/api/book/confirm', {})
      await loadStatus()
    } catch (e) {
      const message =
        e && typeof e === 'object' && 'message' in e &&
        typeof (e as { message?: unknown }).message === 'string'
          ? (e as { message: string }).message : '确认失败'
      setError(message)
    }
  }

  function onLogout() { clearToken(); navigate('/noa/login', { replace: true }) }

  const avatar = status?.avatar
  const book = status?.book
  const regenerateReached = book ? book.regenerateCount >= 2 : false
  const sliderPct = (score / 10) * 100
  const thumbColor = score > 0 ? scoreColor(score) : undefined

  if (loading) return <LoadingSkeleton />

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto max-w-[1200px] px-5 py-4">

        {/* ── Header ── */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                {avatar?.nickname ? `${avatar.nickname}，你好` : '主页面'}
              </h1>
              {status?.themeFood ? (
                <span className="inline-flex items-center gap-1 rounded-full
                               border border-accent/20 bg-accent-light/50 px-2.5 py-0.5
                               text-[11px] font-medium text-accent-hover">
                  <Sparkle size={10} weight="fill" />
                  今日挑战：{status.themeFood}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onLogout}
              className="flex h-9 w-9 items-center justify-center rounded-xl
                         border border-border-light bg-surface text-muted
                         transition-all hover:border-border hover:text-foreground active:scale-[0.97]"
              title="退出登录"
            >
              <SignOut size={16} weight="bold" />
            </button>
            <button
              onClick={() => navigate('/noa/books/history')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border-light
                         bg-surface px-3 py-2 text-xs font-medium text-foreground
                         shadow-[0_1px_3px_rgba(0,0,0,0.04)]
                         transition-all hover:border-border active:scale-[0.97]"
            >
              <ClockCounterClockwise size={15} weight="bold" />
              历史绘本
            </button>
          </div>
        </div>

        {/* ── Feedback banner ── */}
        <AnimatePresence>
          {feedbackText && (
            <motion.div
              key="feedback"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={spring}
              className="mb-3"
            >
              <div className="animate-in rounded-xl border border-accent/20 bg-accent-light/60 px-4 py-2.5">
                <p className="text-xs font-medium leading-relaxed text-accent-hover">{feedbackText}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── 4-cell grid ── */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[7fr_5fr]">

          {/* [col1 row1] Avatar strip */}
          <div className="overflow-hidden rounded-[2rem] border border-border-light bg-surface
                          shadow-[0_20px_40px_-15px_rgba(0,0,0,0.04)]">
            <div className="flex items-center gap-5 p-4">
              <div className={`relative h-20 w-20 shrink-0 overflow-hidden
                              rounded-2xl bg-gradient-to-b from-warm-100 to-warm-200/60
                              ${feedbackText ? 'avatar-glow' : ''}`}>
                {avatar?.baseImage && <img src={avatar.baseImage} alt="base" className="absolute inset-0 h-full w-full" />}
                {avatar?.topImage && <img src={avatar.topImage} alt="top" className="absolute inset-0 h-full w-full" />}
                {avatar?.bottomImage && <img src={avatar.bottomImage} alt="bottom" className="absolute inset-0 h-full w-full" />}
                {avatar?.hairImage && <img src={avatar.hairImage} alt="hair" className="absolute inset-0 h-full w-full" />}
                {avatar?.glassesImage && <img src={avatar.glassesImage} alt="glasses" className="absolute inset-0 h-full w-full" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <SmileyWink size={14} weight="fill" className="shrink-0 text-accent" />
                  <span className="truncate text-sm font-semibold text-foreground">
                    {avatar?.nickname || '我的形象'}
                  </span>
                </div>
                {feedbackText ? (
                  <p className="mt-1.5 text-xs leading-relaxed text-accent-hover line-clamp-2">{feedbackText}</p>
                ) : (
                  <p className="mt-1 text-xs text-muted">心情平静</p>
                )}
              </div>
              <button
                onClick={() => navigate('/noa/avatar')}
                className="shrink-0 inline-flex items-center gap-1 rounded-xl
                           border border-border-light px-3 py-1.5
                           text-[11px] font-medium text-muted
                           transition-all hover:border-border hover:text-foreground active:scale-[0.97]"
              >
                <PencilSimple size={11} weight="bold" />
                编辑
              </button>
            </div>
          </div>

          {/* [col2 row1] Book cover — same height as avatar strip */}
          <div
            className="relative overflow-hidden rounded-[2rem] border border-border-light
                        shadow-[0_20px_40px_-15px_rgba(0,0,0,0.04)]"
            style={{ cursor: book ? 'pointer' : 'default' }}
            onClick={() => book && navigate(`/noa/books/${book.bookID}`)}
            role={book ? 'button' : undefined}
          >
            {bookGenerating && !book ? (
              /* Generating shimmer */
              <div className="absolute inset-0 bg-gradient-to-br from-accent-light/30 via-warm-100 to-warm-200/40">
                <div className="absolute inset-0 book-gen-shimmer" />
                <div className="flex h-full items-center justify-center gap-3 p-4">
                  <div className="book-gen-breathe flex h-10 w-10 shrink-0 items-center justify-center
                                  rounded-xl bg-surface/80 border border-accent/10">
                    <BookOpenText size={22} weight="light" className="text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">绘本生成中</p>
                    <div className="mt-1 flex items-center gap-1">
                      <span className="book-gen-dot h-1 w-1 rounded-full bg-accent/60" style={{ animationDelay: '0ms' }} />
                      <span className="book-gen-dot h-1 w-1 rounded-full bg-accent/60" style={{ animationDelay: '200ms' }} />
                      <span className="book-gen-dot h-1 w-1 rounded-full bg-accent/60" style={{ animationDelay: '400ms' }} />
                    </div>
                  </div>
                </div>
              </div>
            ) : book?.preview ? (
              <>
                <img
                  src={book.preview}
                  alt={book.title}
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{ mixBlendMode: 'multiply' }}
                />
                <div
                  className="absolute inset-0"
                  style={{ background: 'linear-gradient(to top, rgba(255,255,255,0.15), transparent)' }}
                />
                {book.confirmed && (
                  <span className="absolute bottom-2 right-2 inline-flex items-center gap-1
                                   rounded-full bg-accent px-2.5 py-0.5 text-[10px] font-medium text-surface shadow-sm">
                    <CheckCircle size={10} weight="fill" />
                    已确认
                  </span>
                )}
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center
                              bg-gradient-to-br from-accent-light/30 via-warm-100 to-warm-200/40">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface/80 shadow-sm">
                  <BookOpenText size={24} weight="light" className="text-accent" />
                </div>
                <span className="mt-2 text-[11px] font-medium text-muted">提交进食记录后生成</span>
              </div>
            )}
          </div>

          {/* [col1 row2] Food log card */}
          <div className="rounded-[2rem] border border-border-light bg-surface p-6
                          shadow-[0_20px_40px_-15px_rgba(0,0,0,0.04)]">
            <h2 className="mb-5 text-lg font-semibold tracking-tight text-foreground">
              进食情况录入
            </h2>

            <div className="mb-6">
              <div className="mb-3 flex items-center justify-between">
                <label className="text-sm text-muted">
                  请给本次尝试{status?.themeFood || '食物'}打分
                </label>
                <div className="flex items-baseline gap-1.5">
                  <span
                    className="text-lg font-bold tabular-nums transition-colors"
                    style={{ color: score > 0 ? scoreColor(score) : 'var(--color-muted)' }}
                  >
                    {score}
                  </span>
                  <span className="text-xs font-normal text-muted">/ 10</span>
                </div>
              </div>
              <div className="relative">
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
              <div className="mt-2 flex items-center justify-between">
                {scoreTouched && score > 0 ? (
                  <>
                    <span className="text-[10px] text-muted">完全拒绝</span>
                    <span
                      className="animate-in rounded-full px-2.5 py-0.5 text-[10px] font-medium text-surface"
                      style={{ backgroundColor: scoreColor(score) }}
                    >
                      {scoreLabel(score)}
                    </span>
                    <span className="text-[10px] text-muted">非常喜欢</span>
                  </>
                ) : (
                  <span className="mx-auto text-[10px] text-muted">请拖动滑条打分</span>
                )}
              </div>
            </div>

            <div className="mb-5">
              <label className="mb-2 block text-sm text-muted">进食反馈</label>
              <div className="flex gap-2">
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={3}
                  placeholder="描述一下进食过程..."
                  className="form-input flex-1 resize-none"
                />
                <button
                  type="button"
                  onClick={onTranscribe}
                  disabled={voiceLoading}
                  className="flex h-11 w-11 shrink-0 items-center justify-center self-center
                             rounded-xl border border-border-light bg-surface text-foreground
                             transition-all hover:border-accent hover:text-accent
                             active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Microphone size={20} weight={voiceLoading ? 'fill' : 'regular'} />
                </button>
              </div>
            </div>

            {error && (
              <div className="mb-4 rounded-xl border border-error/20 bg-error-light px-4 py-3 text-sm text-error">
                {error}
              </div>
            )}

            <button
              onClick={onSend}
              disabled={!canSend}
              className={`inline-flex w-full items-center justify-center gap-2
                         rounded-xl py-3 text-sm font-semibold
                         transition-all active:scale-[0.98]
                         ${canSend
                           ? 'border border-foreground bg-foreground text-surface hover:opacity-90'
                           : 'cursor-not-allowed border border-warm-200 bg-warm-100 text-muted'
                         }`}
            >
              <PaperPlaneTilt size={18} weight="bold" />
              {sending ? '发送中...' : '发送'}
            </button>
          </div>

          {/* [col2 row2] Book info + actions */}
          <div className="flex flex-col justify-between rounded-[2rem] border border-border-light bg-surface
                          shadow-[0_20px_40px_-15px_rgba(0,0,0,0.04)]">
            {bookGenerating && !book ? (
              <div className="flex-1 p-5 space-y-3">
                <div className="h-3 w-16 rounded skeleton-shimmer" />
                <div className="h-5 w-40 rounded skeleton-shimmer" />
                <div className="h-3.5 w-full rounded skeleton-shimmer" />
                <div className="h-3.5 w-2/3 rounded skeleton-shimmer" />
              </div>
            ) : (
              <>
                <button
                  onClick={() => book && navigate(`/noa/books/${book.bookID}`)}
                  className="flex-1 p-5 text-left transition-opacity hover:opacity-80"
                  style={{ cursor: book ? 'pointer' : 'default', background: 'none', border: 'none' }}
                >
                  <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted">当前绘本</div>
                  <h3 className="text-base font-semibold text-foreground">
                    {book?.title || '等待生成'}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted line-clamp-3">
                    {book?.description || '完成进食记录后，系统会为你生成专属绘本'}
                  </p>
                </button>

                {book && !book.confirmed ? (
                  <div className="px-5 pb-5 space-y-3">
                    <div className="flex gap-3">
                      <button
                        onClick={onConfirmBook}
                        className="flex-1 inline-flex items-center justify-center gap-1.5
                                   rounded-xl border border-accent bg-accent
                                   py-2.5 text-sm font-semibold text-surface
                                   shadow-[0_2px_8px_rgba(5,150,105,0.2)]
                                   transition-all hover:bg-accent-hover active:scale-[0.98]"
                      >
                        <CheckCircle size={16} weight="bold" />
                        确认绘本
                      </button>
                      <button
                        onClick={() => setShowRegenModal(true)}
                        disabled={regenerateReached}
                        className="flex-1 inline-flex items-center justify-center gap-1.5
                                   rounded-xl border border-border bg-surface
                                   py-2.5 text-sm font-semibold text-foreground
                                   transition-all hover:border-foreground active:scale-[0.98]
                                   disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ArrowsClockwise size={16} weight="bold" />
                        重新生成
                      </button>
                    </div>
                    {regenerateReached && (
                      <p className="text-center text-xs text-error">
                        已达到重新生成上限，请确认当前绘本
                      </p>
                    )}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
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
              setBookGenerating(true)
              void refreshStatus()
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
