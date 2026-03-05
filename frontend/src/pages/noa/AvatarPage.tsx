import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { SpinnerGap } from '@phosphor-icons/react'
import { getJson, postJson } from '@/lib/ncApi'

type Option = {
  id: string
  label: string
  image: string
}

type OptionsResponse = {
  hair: Option[]
  glasses: Option[]
  topColors: Option[]
  bottomColors: Option[]
}

type BaseResponse = { image: string }
type ComponentResponse = { image: string }

const spring = { type: 'spring' as const, stiffness: 100, damping: 20 }

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
}
const itemVariants = {
  hidden: { opacity: 0, scale: 0.92 },
  show: { opacity: 1, scale: 1, transition: spring },
}

function OptionGrid({
  label,
  options,
  selectedId,
  onSelect,
}: {
  label: string
  options: Option[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium" style={{ color: 'var(--color-muted)' }}>
        {label}
      </p>
      <motion.div
        className="grid grid-cols-3 gap-2"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        {options.map((item) => (
          <motion.button
            key={item.id}
            variants={itemVariants}
            type="button"
            onClick={() => onSelect(item.id)}
            whileTap={{ scale: 0.95 }}
            className="flex flex-col items-center gap-1.5 p-2 rounded-2xl border transition-colors"
            style={
              selectedId === item.id
                ? {
                    borderColor: 'var(--color-accent)',
                    background: 'var(--color-accent-light)',
                  }
                : {
                    borderColor: 'var(--color-border-light)',
                    background: 'var(--color-surface)',
                  }
            }
          >
            <img
              src={item.image}
              alt={item.label}
              className="w-full object-contain"
              style={{ height: 56 }}
            />
            <span
              className="text-xs font-medium leading-none"
              style={{
                color:
                  selectedId === item.id
                    ? 'var(--color-accent)'
                    : 'var(--color-muted)',
              }}
            >
              {item.label}
            </span>
          </motion.button>
        ))}
      </motion.div>
    </div>
  )
}

export default function AvatarPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [baseImage, setBaseImage] = useState('')
  const [options, setOptions] = useState<OptionsResponse | null>(null)

  const [nickname, setNickname] = useState('')
  const [gender, setGender] = useState<'male' | 'female' | ''>('')

  const [hairId, setHairId] = useState('')
  const [glassesId, setGlassesId] = useState('')
  const [topId, setTopId] = useState('')
  const [bottomId, setBottomId] = useState('')

  const [hairImage, setHairImage] = useState('')
  const [glassesImage, setGlassesImage] = useState('')
  const [topImage, setTopImage] = useState('')
  const [bottomImage, setBottomImage] = useState('')

  const canSubmit = useMemo(
    () => !!nickname.trim() && !!gender && !saving,
    [nickname, gender, saving],
  )

  async function fetchComponent(
    type: 'hair' | 'glasses' | 'top' | 'bottom',
    id: string,
  ) {
    const data = await getJson<ComponentResponse>(
      `/api/avatar/component?type=${type}&id=${id}`,
    )
    return data.image
  }

  useEffect(() => {
    async function load() {
      setError('')
      try {
        const [base, opts] = await Promise.all([
          getJson<BaseResponse>('/api/avatar/base'),
          getJson<OptionsResponse>('/api/avatar/options'),
        ])
        setBaseImage(base.image)
        setOptions(opts)

        const defaultHair = opts.hair[0]?.id || ''
        const defaultGlasses =
          opts.glasses.find((g) => g.id === 'none')?.id || opts.glasses[0]?.id || ''
        const defaultTop = opts.topColors[0]?.id || ''
        const defaultBottom = opts.bottomColors[0]?.id || ''

        setHairId(defaultHair)
        setGlassesId(defaultGlasses)
        setTopId(defaultTop)
        setBottomId(defaultBottom)

        const [hairRes, glassesRes, topRes, bottomRes] = await Promise.all([
          defaultHair ? fetchComponent('hair', defaultHair) : Promise.resolve(''),
          defaultGlasses ? fetchComponent('glasses', defaultGlasses) : Promise.resolve(''),
          defaultTop ? fetchComponent('top', defaultTop) : Promise.resolve(''),
          defaultBottom ? fetchComponent('bottom', defaultBottom) : Promise.resolve(''),
        ])
        setHairImage(hairRes)
        setGlassesImage(glassesRes)
        setTopImage(topRes)
        setBottomImage(bottomRes)
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载失败')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function onSelectHair(id: string) {
    setHairId(id)
    try { setHairImage(await fetchComponent('hair', id)) }
    catch (e) { setError(e instanceof Error ? e.message : '加载失败') }
  }
  async function onSelectGlasses(id: string) {
    setGlassesId(id)
    try { setGlassesImage(await fetchComponent('glasses', id)) }
    catch (e) { setError(e instanceof Error ? e.message : '加载失败') }
  }
  async function onSelectTop(id: string) {
    setTopId(id)
    try { setTopImage(await fetchComponent('top', id)) }
    catch (e) { setError(e instanceof Error ? e.message : '加载失败') }
  }
  async function onSelectBottom(id: string) {
    setBottomId(id)
    try { setBottomImage(await fetchComponent('bottom', id)) }
    catch (e) { setError(e instanceof Error ? e.message : '加载失败') }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!nickname.trim() || !gender) { setError('昵称和性别不能为空'); return }
    setSaving(true)
    try {
      await postJson('/api/avatar/save', {
        nickname: nickname.trim(),
        gender,
        hairStyle: hairId,
        glasses: glassesId,
        topColor: topId,
        bottomColor: bottomId,
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
      setSaving(false)
    }
  }

  return (
    <div className="min-h-[100dvh]" style={{ background: 'var(--color-background)' }}>
      {/* ── Page header ── */}
      <header
        className="sticky top-0 z-10 px-5 h-12 flex items-center border-b"
        style={{
          background: 'rgba(250,250,249,0.85)',
          backdropFilter: 'blur(12px)',
          borderColor: 'var(--color-border-light)',
        }}
      >
        <motion.div
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={spring}
        >
          <span
            className="text-sm font-semibold tracking-tight"
            style={{ color: 'var(--color-foreground)' }}
          >
            创建形象
          </span>
        </motion.div>
      </header>

      {loading ? (
        /* ── Skeleton ── */
        <div className="px-5 pt-6 max-w-[600px] mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-6">
            <div
              className="rounded-3xl skeleton-shimmer"
              style={{ aspectRatio: '3/4' }}
            />
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-10 rounded-xl skeleton-shimmer"
                  style={{ width: i % 2 === 0 ? '70%' : '100%' }}
                />
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="px-5 pt-6 pb-10 max-w-[600px] mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-6 items-start">

            {/* ── Left: avatar preview (sticky on desktop) ── */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={spring}
              className="md:sticky md:top-16"
            >
              <div
                className="rounded-3xl border overflow-hidden"
                style={{
                  background: 'var(--color-warm-100)',
                  borderColor: 'var(--color-border-light)',
                  aspectRatio: '3/4',
                  position: 'relative',
                  boxShadow: '0 20px 40px -12px rgba(0,0,0,0.06)',
                }}
              >
                {baseImage && (
                  <img
                    src={baseImage}
                    alt="base"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                )}
                {topImage && (
                  <img
                    src={topImage}
                    alt="top"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                )}
                {bottomImage && (
                  <img
                    src={bottomImage}
                    alt="bottom"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                )}
                {hairImage && (
                  <img
                    src={hairImage}
                    alt="hair"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                )}
                {glassesImage && (
                  <img
                    src={glassesImage}
                    alt="glasses"
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                )}
                {/* Preview label */}
                <div
                  className="absolute bottom-3 left-1/2 -translate-x-1/2 text-xs font-medium px-3 py-1 rounded-full"
                  style={{
                    background: 'rgba(255,255,255,0.7)',
                    backdropFilter: 'blur(8px)',
                    color: 'var(--color-muted)',
                    border: '1px solid rgba(255,255,255,0.5)',
                  }}
                >
                  {nickname || '我的形象'}
                </div>
              </div>
            </motion.div>

            {/* ── Right: form ── */}
            <form onSubmit={onSubmit} className="space-y-7">

              {/* Basic info */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 0.06 }}
                className="space-y-4"
              >
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-xs font-mono font-medium"
                    style={{ color: 'var(--color-accent)' }}
                  >
                    01
                  </span>
                  <span
                    className="text-sm font-semibold tracking-tight"
                    style={{ color: 'var(--color-foreground)' }}
                  >
                    基本信息
                  </span>
                </div>
                <div
                  className="h-px"
                  style={{ background: 'var(--color-border-light)' }}
                />

                <div className="space-y-1.5">
                  <label
                    className="block text-xs font-medium"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    昵称
                  </label>
                  <input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="给自己起一个名字"
                    className="form-input"
                  />
                </div>

                <div className="space-y-1.5">
                  <p
                    className="text-xs font-medium"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    性别
                  </p>
                  <div className="flex gap-2">
                    {[
                      { value: 'male' as const, label: '男孩' },
                      { value: 'female' as const, label: '女孩' },
                    ].map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setGender(item.value)}
                        className="flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors active:scale-[0.97]"
                        style={
                          gender === item.value
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
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>

              {/* Hair */}
              {options && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...spring, delay: 0.1 }}
                  className="space-y-3"
                >
                  <div className="flex items-baseline gap-2">
                    <span
                      className="text-xs font-mono font-medium"
                      style={{ color: 'var(--color-accent)' }}
                    >
                      02
                    </span>
                    <span
                      className="text-sm font-semibold tracking-tight"
                      style={{ color: 'var(--color-foreground)' }}
                    >
                      形象定制
                    </span>
                  </div>
                  <div
                    className="h-px"
                    style={{ background: 'var(--color-border-light)' }}
                  />
                  <div className="space-y-5">
                    <OptionGrid
                      label="发型"
                      options={options.hair}
                      selectedId={hairId}
                      onSelect={onSelectHair}
                    />
                    <OptionGrid
                      label="眼镜"
                      options={options.glasses}
                      selectedId={glassesId}
                      onSelect={onSelectGlasses}
                    />
                    <OptionGrid
                      label="上衣颜色"
                      options={options.topColors}
                      selectedId={topId}
                      onSelect={onSelectTop}
                    />
                    <OptionGrid
                      label="下装颜色"
                      options={options.bottomColors}
                      selectedId={bottomId}
                      onSelect={onSelectBottom}
                    />
                  </div>
                </motion.div>
              )}

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.p
                    key="error"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-sm px-4 py-3 rounded-xl"
                    style={{
                      color: 'var(--color-error)',
                      background: 'var(--color-error-light)',
                    }}
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              {/* Submit */}
              <motion.button
                type="submit"
                disabled={!canSubmit}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 0.18 }}
                whileTap={canSubmit ? { scale: 0.98 } : undefined}
                className="w-full py-4 rounded-2xl font-semibold text-sm text-white transition-all"
                style={{
                  background: canSubmit ? 'var(--color-accent)' : 'var(--color-muted)',
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  boxShadow: canSubmit
                    ? '0 8px 24px -4px rgba(5,150,105,0.3)'
                    : 'none',
                  border: 'none',
                }}
              >
                {saving ? (
                  <span className="flex items-center justify-center gap-2">
                    <SpinnerGap size={16} weight="bold" className="animate-spin" />
                    提交中…
                  </span>
                ) : (
                  '提交并进入主页面'
                )}
              </motion.button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
