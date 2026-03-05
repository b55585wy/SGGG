import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  CaretDown,
  CaretUp,
  ForkKnife,
  PencilLine,
  SlidersHorizontal,
  GameController,
  Compass,
  UsersThree,
  Palette,
  SpinnerGap,
} from '@phosphor-icons/react'
import { getJson, postJson } from '@/lib/ncApi'

type HomeStatusResponse = {
  themeFood: string
  book: {
    bookID: string
    title: string
    confirmed: boolean
    regenerateCount: number
  }
}

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

const spring = { type: 'spring' as const, stiffness: 100, damping: 20 }

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: spring },
}

export default function BookCreatePage() {
  const navigate = useNavigate()
  const location = useLocation()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [regenerateCount, setRegenerateCount] = useState(0)
  const [themeFood, setThemeFood] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Required
  const [reason, setReason] = useState('')

  // Food override (optional, temporary for this regeneration only)
  const [foodOverride, setFoodOverride] = useState('')

  // Optional collapsible sections
  const [showHints, setShowHints] = useState(false)
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')

  const [showAdvanced, setShowAdvanced] = useState(false)
  const [storyType, setStoryType] = useState('interactive')
  const [difficulty, setDifficulty] = useState('medium')
  const [pages, setPages] = useState(6)
  const [interactionDensity, setInteractionDensity] = useState('medium')

  const allowEntry =
    location.state &&
    typeof location.state === 'object' &&
    'fromRegenerate' in location.state &&
    (location.state as { fromRegenerate?: unknown }).fromRegenerate === true

  const loadStatus = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const data = await getJson<HomeStatusResponse>('/api/home/status')
      setRegenerateCount(data.book?.regenerateCount ?? 0)
      setThemeFood(data.themeFood ?? '')
      if (data.book?.confirmed) {
        navigate('/noa/home', { replace: true })
        return
      }
    } catch (e) {
      const message =
        e && typeof e === 'object' && 'message' in e &&
        typeof (e as { message?: unknown }).message === 'string'
          ? (e as { message: string }).message
          : '加载失败'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [navigate])

  useEffect(() => {
    if (!allowEntry) {
      navigate('/noa/home', { replace: true })
      return
    }
    void loadStatus()
  }, [allowEntry, loadStatus, navigate])

  const reachedLimit = regenerateCount >= 2
  const canSubmit = useMemo(
    () => !loading && !submitting && !reachedLimit && reason !== '',
    [loading, submitting, reachedLimit, reason],
  )

  async function onSubmit() {
    setError('')
    if (reachedLimit) { setError('已达到重新生成上限'); return }
    if (!reason) { setError('请先选择一个不满意的原因'); return }
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
      navigate('/noa/home', { replace: true })
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

  if (!allowEntry) return null

  return (
    <div
      className="min-h-[100dvh]"
      style={{ background: 'var(--color-background)' }}
    >
      {/* ── Sticky header ── */}
      <header
        className="sticky top-0 z-10 flex items-center h-11 px-4 border-b"
        style={{
          background: 'rgba(250,250,249,0.85)',
          backdropFilter: 'blur(12px)',
          borderColor: 'var(--color-border-light)',
        }}
      >
        <button
          type="button"
          onClick={() => navigate('/noa/home')}
          className="flex items-center gap-1.5 text-xs font-medium transition-opacity hover:opacity-60 active:opacity-40"
          style={{ color: 'var(--color-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: '6px 0' }}
        >
          <ArrowLeft size={14} weight="bold" />
          返回
        </button>
        <div className="flex-1" />
        {!loading && (
          <span
            className="text-xs font-mono tabular-nums"
            style={{ color: reachedLimit ? 'var(--color-error)' : 'var(--color-muted)' }}
          >
            {regenerateCount}/2
          </span>
        )}
      </header>

      <div className="px-5 pt-7 pb-10 max-w-[480px]">
        {/* ── Page title ── */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={spring}
          className="mb-8"
        >
          <h1
            className="text-3xl font-semibold tracking-tight leading-none mb-2"
            style={{ color: 'var(--color-foreground)' }}
          >
            重新生成
          </h1>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            告诉我哪里不对，我来重新创作一个更好的故事。
          </p>
        </motion.div>

        {/* ── Error ── */}
        <AnimatePresence>
          {error && (
            <motion.p
              key="error"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="text-sm px-4 py-3 rounded-xl mb-5"
              style={{ color: 'var(--color-error)', background: 'var(--color-error-light)' }}
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        {/* ══ Section 01: Reason (required) ══ */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.06 }}
          className="mb-8"
        >
          <div className="flex items-baseline gap-2 mb-3">
            <span
              className="text-xs font-mono font-medium"
              style={{ color: 'var(--color-accent)' }}
            >
              01
            </span>
            <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--color-foreground)' }}>
              不满意的原因
            </span>
            <span className="text-xs ml-auto" style={{ color: 'var(--color-error)' }}>必填</span>
          </div>

          <motion.div
            className="grid grid-cols-2 gap-2"
            variants={containerVariants}
            initial="hidden"
            animate="show"
          >
            {REASONS.map((r) => (
              <motion.button
                key={r.value}
                variants={itemVariants}
                type="button"
                onClick={() => setReason(r.value)}
                whileTap={{ scale: 0.97 }}
                className="py-2.5 px-3 rounded-xl text-sm font-medium border text-left transition-colors"
                style={
                  reason === r.value
                    ? {
                        borderColor: 'var(--color-accent)',
                        background: 'var(--color-accent-light)',
                        color: 'var(--color-accent)',
                      }
                    : {
                        borderColor: 'var(--color-border)',
                        background: 'var(--color-surface)',
                        color: 'var(--color-foreground)',
                      }
                }
              >
                {r.label}
              </motion.button>
            ))}
          </motion.div>
        </motion.section>

        {/* ══ Section 02: Food override (optional) ══ */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.12 }}
          className="mb-8"
        >
          <div className="flex items-baseline gap-2 mb-3">
            <span
              className="text-xs font-mono font-medium"
              style={{ color: 'var(--color-accent)' }}
            >
              02
            </span>
            <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--color-foreground)' }}>
              临时换个食物
            </span>
            {themeFood && (
              <span
                className="text-xs ml-auto px-2 py-0.5 rounded-full font-mono"
                style={{
                  color: 'var(--color-muted)',
                  background: 'var(--color-warm-100)',
                  border: '1px solid var(--color-border-light)',
                }}
              >
                当前 {themeFood}
              </span>
            )}
          </div>

          <div className="relative">
            <ForkKnife
              size={15}
              weight="duotone"
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--color-muted)' }}
            />
            <input
              value={foodOverride}
              onChange={(e) => setFoodOverride(e.target.value)}
              placeholder={themeFood ? `换掉"${themeFood}"，仅此次生效` : '输入食物名称（仅此次生效）'}
              className="form-input"
              style={{ paddingLeft: 34 }}
            />
          </div>
        </motion.section>

        {/* ══ Section 03: Hints (optional, collapsible) ══ */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.18 }}
          className="mb-6"
        >
          <button
            type="button"
            onClick={() => setShowHints((v) => !v)}
            className="flex items-center gap-2 w-full text-left mb-1 group"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <span
              className="text-xs font-mono font-medium"
              style={{ color: 'var(--color-accent)' }}
            >
              03
            </span>
            <PencilLine size={13} weight="bold" style={{ color: 'var(--color-muted)' }} />
            <span
              className="text-sm font-semibold tracking-tight flex-1"
              style={{ color: 'var(--color-foreground)' }}
            >
              补充说明
            </span>
            <span className="text-xs" style={{ color: 'var(--color-muted)' }}>可选</span>
            {showHints
              ? <CaretUp size={12} weight="bold" style={{ color: 'var(--color-muted)' }} />
              : <CaretDown size={12} weight="bold" style={{ color: 'var(--color-muted)' }} />}
          </button>

          <div
            className="mt-1"
            style={{ borderTop: '1px solid var(--color-border-light)' }}
          />

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
                <div className="pt-4 space-y-4">
                  <div className="space-y-1.5">
                    <label
                      className="block text-xs font-medium"
                      style={{ color: 'var(--color-muted)' }}
                    >
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
                    <label
                      className="block text-xs font-medium"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      更多要求
                    </label>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="描述你希望新故事有什么不同…"
                      rows={3}
                      className="form-input resize-none"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>

        {/* ══ Section 04: Advanced config (optional, collapsible) ══ */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.22 }}
          className="mb-8"
        >
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-2 w-full text-left mb-1"
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            <span
              className="text-xs font-mono font-medium"
              style={{ color: 'var(--color-accent)' }}
            >
              04
            </span>
            <SlidersHorizontal size={13} weight="bold" style={{ color: 'var(--color-muted)' }} />
            <span
              className="text-sm font-semibold tracking-tight flex-1"
              style={{ color: 'var(--color-foreground)' }}
            >
              故事设置
            </span>
            <span className="text-xs" style={{ color: 'var(--color-muted)' }}>可选</span>
            {showAdvanced
              ? <CaretUp size={12} weight="bold" style={{ color: 'var(--color-muted)' }} />
              : <CaretDown size={12} weight="bold" style={{ color: 'var(--color-muted)' }} />}
          </button>

          <div
            className="mt-1"
            style={{ borderTop: '1px solid var(--color-border-light)' }}
          />

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
                <div className="pt-4 space-y-5">
                  {/* Story type button grid */}
                  <div className="space-y-2">
                    <label
                      className="block text-xs font-medium"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      故事类型
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {STORY_TYPES.map(({ value, label, Icon }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setStoryType(value)}
                          className="flex items-center gap-2 py-2.5 px-3 rounded-xl text-sm font-medium border transition-colors active:scale-[0.97]"
                          style={
                            storyType === value
                              ? {
                                  borderColor: 'var(--color-accent)',
                                  background: 'var(--color-accent-light)',
                                  color: 'var(--color-accent)',
                                }
                              : {
                                  borderColor: 'var(--color-border)',
                                  background: 'var(--color-surface)',
                                  color: 'var(--color-foreground)',
                                }
                          }
                        >
                          <Icon size={14} weight="duotone" />
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label
                        className="block text-xs font-medium"
                        style={{ color: 'var(--color-muted)' }}
                      >
                        难度
                      </label>
                      <select
                        value={difficulty}
                        onChange={(e) => setDifficulty(e.target.value)}
                        className="form-input"
                      >
                        <option value="easy">简单</option>
                        <option value="medium">中等</option>
                        <option value="hard">困难</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <label
                        className="block text-xs font-medium"
                        style={{ color: 'var(--color-muted)' }}
                      >
                        交互密度
                      </label>
                      <select
                        value={interactionDensity}
                        onChange={(e) => setInteractionDensity(e.target.value)}
                        className="form-input"
                      >
                        <option value="low">少</option>
                        <option value="medium">中</option>
                        <option value="high">多</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      className="block text-xs font-medium"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      页数 <span className="font-mono">{pages}</span>
                    </label>
                    <input
                      type="range"
                      min={4}
                      max={12}
                      value={pages}
                      onChange={(e) => setPages(Number(e.target.value))}
                      className="w-full accent-[var(--color-accent)]"
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.section>

        {/* ══ Submit ══ */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.26 }}
        >
          {reachedLimit ? (
            <div
              className="text-center text-sm py-4 rounded-xl font-medium"
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
                boxShadow: canSubmit
                  ? '0 8px 24px -4px rgba(5,150,105,0.3)'
                  : 'none',
              }}
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <SpinnerGap size={16} weight="bold" className="animate-spin" />
                  生成中…
                </span>
              ) : (
                '提交并重新生成'
              )}
            </button>
          )}
        </motion.div>
      </div>
    </div>
  )
}
