import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { clearToken } from '@/lib/auth'
import { getJson, postJson } from '@/lib/ncApi'
import AvatarEditModal from '@/components/AvatarEditModal'
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
  const [error, setError] = useState('')

  const reachedLimit = regenerateCount >= 2
  const canSubmit = !reachedLimit && reason !== ''

  function onSubmit() {
    if (!reason) { setError('请选择一个不满意的原因'); return }
    // Close immediately — fire API in background
    onSuccess()
    postJson('/api/book/regenerate', {
      reason,
      target_food: foodOverride.trim() || undefined,
      title: title.trim() || undefined,
      note: note.trim() || undefined,
      story_type: storyType,
      difficulty,
      pages,
      interaction_density: interactionDensity,
    }).catch(() => { /* silently handle */ })
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

            {/* Reason (required) */}
            <section>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-xs font-mono font-semibold" style={{ color: 'var(--color-accent)' }}>01</span>
                <span className="text-sm font-bold tracking-tight" style={{ color: 'var(--color-foreground)' }}>不满意的原因</span>
                <span className="text-xs ml-auto" style={{ color: 'var(--color-error)' }}>必填</span>
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

            {/* Hints (collapsible) */}
            <section>
              <button type="button" onClick={() => setShowHints((v) => !v)} className="flex items-center gap-2 w-full text-left" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <span className="text-xs font-mono font-semibold" style={{ color: 'var(--color-accent)' }}>03</span>
                <PencilLine size={12} weight="bold" style={{ color: 'var(--color-muted)' }} />
                <span className="text-sm font-bold tracking-tight flex-1" style={{ color: 'var(--color-foreground)' }}>补充说明</span>
                <span className="text-xs" style={{ color: 'var(--color-muted)' }}>可选</span>
                {showHints ? <CaretUp size={11} weight="bold" style={{ color: 'var(--color-muted)' }} /> : <CaretDown size={11} weight="bold" style={{ color: 'var(--color-muted)' }} />}
              </button>
              <div className="mt-2" style={{ borderTop: '1px solid var(--color-border-light)' }} />
              <AnimatePresence>
                {showHints && (
                  <motion.div key="hints" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={spring} className="overflow-hidden">
                    <div className="pt-3 space-y-3">
                      <div className="space-y-1.5">
                        <label className="block text-xs font-medium" style={{ color: 'var(--color-muted)' }}>标题建议</label>
                        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="给新故事起个名字" className="form-input" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="block text-xs font-medium" style={{ color: 'var(--color-muted)' }}>更多要求</label>
                        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="描述你希望新故事有什么不同…" rows={2} className="form-input resize-none" />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

            {/* Advanced (collapsible) */}
            <section>
              <button type="button" onClick={() => setShowAdvanced((v) => !v)} className="flex items-center gap-2 w-full text-left" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                <span className="text-xs font-mono font-semibold" style={{ color: 'var(--color-accent)' }}>04</span>
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
                      <div className="space-y-2">
                        <label className="block text-xs font-medium" style={{ color: 'var(--color-muted)' }}>故事类型</label>
                        <div className="grid grid-cols-2 gap-2">
                          {STORY_TYPES.map(({ value, label, Icon }) => (
                            <button key={value} type="button" onClick={() => setStoryType(value)} className="flex items-center gap-2 py-2 px-3 rounded-xl text-sm font-medium border transition-colors" style={storyType === value ? { borderColor: 'var(--color-accent)', background: 'var(--color-accent-light)', color: 'var(--color-accent)' } : { borderColor: 'var(--color-border-light)', background: '#fafaf9', color: 'var(--color-foreground)' }}>
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
                        <label className="block text-xs font-medium" style={{ color: 'var(--color-muted)' }}>页数 <span className="font-mono">{pages}</span></label>
                        <input type="range" min={4} max={12} value={pages} onChange={(e) => setPages(Number(e.target.value))} className="w-full accent-[var(--color-accent)]" />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
          </div>

          {/* Footer */}
          <div className="shrink-0 px-6 py-4 border-t space-y-3" style={{ borderColor: 'var(--color-border-light)' }}>
            <AnimatePresence>
              {error && (
                <motion.p key="err" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="text-sm px-3 py-2 rounded-xl" style={{ color: 'var(--color-error)', background: 'var(--color-error-light)' }}>
                  {error}
                </motion.p>
              )}
            </AnimatePresence>
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

// ─── Food Log Modal ───────────────────────────────────────────────────────────

type FoodLogModalProps = {
  themeFood: string
  onClose: () => void
  onSuccess: (data: FoodLogResponse) => void
}

function FoodLogModal({ themeFood, onClose, onSuccess }: FoodLogModalProps) {
  const [score, setScore] = useState(0)
  const [scoreTouched, setScoreTouched] = useState(false)
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [voiceLoading, setVoiceLoading] = useState(false)
  const [error, setError] = useState('')

  const canSend = useMemo(
    () => !!content.trim() && scoreTouched && score > 0 && !sending,
    [content, scoreTouched, score, sending],
  )

  const sliderPct = (score / 10) * 100
  const thumbColor = score > 0 ? scoreColor(score) : undefined

  async function onSend() {
    setError('')
    if (!scoreTouched || score <= 0) { setError('请先滑动评分条'); return }
    if (!content.trim()) { setError('请输入进食记录'); return }
    setSending(true)
    try {
      const data = await postJson<FoodLogResponse>('/api/food/log', { score, content: content.trim() })
      onSuccess(data)
    } catch (e) {
      const message =
        e && typeof e === 'object' && 'message' in e &&
        typeof (e as { message?: unknown }).message === 'string'
          ? (e as { message: string }).message : '提交失败'
      setError(message)
      setSending(false)
    }
  }

  async function onTranscribe() {
    setError('')
    setVoiceLoading(true)
    try {
      const data = await postJson<VoiceResponse>('/api/voice/transcribe', {})
      setContent(data.text)
    } catch { /* ignore */ } finally {
      setVoiceLoading(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <motion.div
        key="food-backdrop"
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
          key="food-dialog"
          initial={{ opacity: 0, scale: 0.93, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.93, y: -10 }}
          transition={spring}
          className="pointer-events-auto flex flex-col w-full"
          style={{
            maxWidth: 480,
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
            <div className="flex items-center gap-2.5">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                style={{ background: 'var(--color-accent-light)' }}
              >
                <span className="text-sm">🍽️</span>
              </div>
              <div>
                <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--color-foreground)' }}>
                  进食情况录入
                </h2>
                {themeFood && (
                  <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                    今日食物：{themeFood}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full transition-all active:scale-[0.93]"
              style={{ background: 'var(--color-warm-100)', border: 'none', cursor: 'pointer', color: 'var(--color-muted)' }}
            >
              <X size={15} weight="bold" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
            {/* Score */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-bold tracking-tight" style={{ color: 'var(--color-foreground)' }}>
                  给本次尝试{themeFood ? `「${themeFood}」` : '食物'}打分
                </label>
                <div className="flex items-baseline gap-1">
                  <span
                    className="text-xl font-bold tabular-nums transition-colors"
                    style={{ color: score > 0 ? scoreColor(score) : 'var(--color-muted)' }}
                  >
                    {score}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--color-muted)' }}>/10</span>
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
              {scoreTouched && score > 0 && (
                <div className="mt-2 flex justify-center">
                  <span
                    className="rounded-full px-3 py-0.5 text-[10px] font-bold text-white"
                    style={{ background: scoreColor(score) }}
                  >
                    {scoreLabel(score)}
                  </span>
                </div>
              )}
            </div>

            {/* Text input */}
            <div className="space-y-2">
              <label className="text-sm font-bold tracking-tight" style={{ color: 'var(--color-foreground)' }}>
                进食过程
              </label>
              <div className="flex gap-2">
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="描述一下进食过程..."
                  className="form-input flex-1 resize-none"
                  rows={4}
                />
                <button
                  type="button"
                  onClick={onTranscribe}
                  disabled={voiceLoading}
                  className="shrink-0 flex items-center justify-center self-stretch rounded-2xl border w-11 transition-all active:scale-[0.95] disabled:opacity-50"
                  style={{ borderColor: 'var(--color-border-light)', background: '#fafaf9', color: 'var(--color-foreground)' }}
                >
                  <Microphone size={20} weight={voiceLoading ? 'fill' : 'regular'} />
                </button>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 px-6 py-4 border-t space-y-3" style={{ borderColor: 'var(--color-border-light)' }}>
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
            <button
              type="button"
              onClick={onSend}
              disabled={!canSend}
              className="w-full py-3.5 rounded-full font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              style={{
                background: canSend ? 'linear-gradient(135deg, #18181b, #3f3f46)' : 'var(--color-warm-100)',
                color: canSend ? 'white' : 'var(--color-muted)',
                cursor: canSend ? 'pointer' : 'not-allowed',
                border: 'none',
                boxShadow: canSend ? '0 8px 20px -4px rgba(0,0,0,0.3)' : 'none',
              }}
            >
              <PaperPlaneTilt size={17} weight="bold" />
              {sending ? '发送中...' : '提交记录 →'}
            </button>
          </div>
        </motion.div>
      </div>
    </>
  )
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

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
      <div className="flex-1 min-h-0 flex gap-4 p-4 pt-3">
        <div className="w-[34%] rounded-[2.5rem] skeleton-shimmer" />
        <div className="flex-1 rounded-[2rem] skeleton-shimmer" />
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
  const [showAvatarModal, setShowAvatarModal] = useState(false)
  const [showFoodModal, setShowFoodModal] = useState(false)
  const [bookGenerating, setBookGenerating] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
          {status?.themeFood && (
            <span
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold"
              style={{ background: 'var(--color-accent-light)', color: 'var(--color-accent)' }}
            >
              <Sparkle size={10} weight="fill" />
              今日：{status.themeFood}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowFoodModal(true)}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold border transition-all active:scale-[0.97]"
            style={{
              borderColor: 'var(--color-border-light)',
              background: 'white',
              color: 'var(--color-foreground)',
            }}
          >
            <ForkKnife size={14} weight="bold" />
            记录进食
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

      {/* ── Main 2-column layout ── */}
      <div className="relative z-10 flex-1 min-h-0 flex gap-4 p-4 pt-3">

        {/* ── Left: Avatar card (full height) ── */}
        <motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={spring}
          className="w-[34%] relative overflow-hidden rounded-[2.5rem] flex flex-col"
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
            {avatar?.baseImage && <img src={avatar.baseImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
            {avatar?.topImage && <img src={avatar.topImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
            {avatar?.bottomImage && <img src={avatar.bottomImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
            {avatar?.hairImage && <img src={avatar.hairImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
            {avatar?.glassesImage && <img src={avatar.glassesImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
            {/* Bottom fade */}
            <div
              className="absolute bottom-0 inset-x-0 h-40 pointer-events-none"
              style={{ background: 'linear-gradient(to top, white 10%, transparent)' }}
            />
          </div>

          {/* Avatar info + feedback bubble */}
          <div className="relative z-10 shrink-0 px-5 pb-5 space-y-3">
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

            {/* Speech bubble */}
            {feedbackText ? (
              <div className="relative">
                {/* Bubble tail */}
                <div
                  className="absolute -top-2 left-6"
                  style={{
                    width: 0, height: 0,
                    borderLeft: '7px solid transparent',
                    borderRight: '7px solid transparent',
                    borderBottom: '8px solid #d1fae5',
                  }}
                />
                <div
                  className="rounded-2xl px-4 py-3"
                  style={{ background: 'var(--color-accent-light)' }}
                >
                  <p className="text-xs leading-relaxed line-clamp-3" style={{ color: 'var(--color-accent-hover)' }}>
                    {feedbackText}
                  </p>
                </div>
              </div>
            ) : (
              <div
                className="rounded-2xl px-4 py-2.5"
                style={{ background: 'var(--color-warm-100)' }}
              >
                <p className="text-xs" style={{ color: 'var(--color-muted)' }}>今天心情平静 😊</p>
              </div>
            )}
          </div>
        </motion.div>

        {/* ── Right: Book card ── */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">

          {/* ── Book card ── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring, delay: 0.06 }}
            className="flex-1 min-h-0 rounded-[2rem] overflow-hidden flex"
            style={{
              background: 'white',
              boxShadow: '0 8px 28px -8px rgba(0,0,0,0.06), 0 0 0 1px rgba(231,229,228,0.6)',
            }}
          >
            {/* Book cover thumbnail */}
            <div
              className="w-[38%] relative shrink-0 overflow-hidden"
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
              ) : book?.preview ? (
                <>
                  <img
                    src={book.preview}
                    alt={book.title}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: 'linear-gradient(to right, transparent 60%, rgba(255,255,255,0.12))' }}
                  />
                  {book.confirmed && (
                    <span
                      className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold text-white"
                      style={{ background: 'var(--color-accent)', boxShadow: '0 2px 8px rgba(5,150,105,0.4)' }}
                    >
                      <CheckCircle size={9} weight="fill" />
                      已确认
                    </span>
                  )}
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
                    提交后生成
                  </span>
                </div>
              )}
            </div>

            {/* Book info */}
            <div className="flex-1 min-w-0 p-5 flex flex-col">
              <div
                className="text-[10px] font-bold uppercase tracking-widest mb-2 shrink-0"
                style={{ color: 'var(--color-accent)' }}
              >
                📖 当前绘本
              </div>

              <button
                onClick={() => book && navigate(`/noa/books/${book.bookID}`)}
                className="flex-1 min-h-0 text-left"
                style={{ background: 'none', border: 'none', cursor: book ? 'pointer' : 'default', padding: 0 }}
              >
                {bookGenerating && !book ? (
                  <div className="space-y-2">
                    <div className="h-4 w-32 rounded skeleton-shimmer" />
                    <div className="h-3 w-full rounded skeleton-shimmer" />
                    <div className="h-3 w-2/3 rounded skeleton-shimmer" />
                  </div>
                ) : (
                  <>
                    <h3 className="text-sm font-bold mb-2 line-clamp-1" style={{ color: 'var(--color-foreground)' }}>
                      {book?.title || '等待生成'}
                    </h3>
                    <p className="text-xs leading-relaxed line-clamp-4" style={{ color: 'var(--color-muted)' }}>
                      {book?.description || '完成进食记录后，系统会为你生成专属绘本'}
                    </p>
                  </>
                )}
              </button>

              {/* Actions */}
              {book && !book.confirmed && (
                <div className="shrink-0 flex gap-2.5 mt-3">
                  <button
                    onClick={onConfirmBook}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full py-2.5 text-xs font-bold text-white transition-all active:scale-[0.97]"
                    style={{
                      background: 'linear-gradient(135deg, #059669, #047857)',
                      border: 'none',
                      boxShadow: '0 4px 14px rgba(5,150,105,0.3)',
                      cursor: 'pointer',
                    }}
                  >
                    <CheckCircle size={13} weight="bold" />
                    确认绘本
                  </button>
                  <button
                    onClick={() => setShowRegenModal(true)}
                    disabled={regenerateReached}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full py-2.5 text-xs font-bold border transition-all active:scale-[0.97]"
                    style={{
                      borderColor: 'var(--color-border)',
                      background: 'white',
                      color: 'var(--color-foreground)',
                      cursor: regenerateReached ? 'not-allowed' : 'pointer',
                      opacity: regenerateReached ? 0.4 : 1,
                    }}
                  >
                    <ArrowsClockwise size={13} weight="bold" />
                    重新生成
                  </button>
                </div>
              )}
              {regenerateReached && book && !book.confirmed && (
                <p className="text-center text-[10px] mt-2 shrink-0" style={{ color: 'var(--color-error)' }}>
                  已达到重新生成上限，请确认当前绘本
                </p>
              )}
            </div>
          </motion.div>
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
              setStatus((prev) => (prev ? { ...prev, book: null } : null))
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

      <AnimatePresence>
        {showFoodModal && (
          <FoodLogModal
            themeFood={status?.themeFood ?? ''}
            onClose={() => setShowFoodModal(false)}
            onSuccess={(data) => {
              setShowFoodModal(false)
              setFeedbackText(data.feedbackText)
              sessionStorage.setItem('homeFeedbackText', data.feedbackText)
              setStatus((prev) => (prev ? { ...prev, book: null } : null))
              setBookGenerating(true)
            }}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
