import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { SpinnerGap, Sparkle } from '@phosphor-icons/react'
import { getJson, postJson } from '@/lib/ncApi'

type Option = { id: string; label: string; image: string }
type OptionsResponse = {
  hair: Option[]
  glasses: Option[]
  topColors: Option[]
  bottomColors: Option[]
}
type BaseResponse = { image: string }
type ComponentResponse = { image: string }
type CurrentAvatarResponse = {
  nickname: string
  gender: string
  hairStyle: string | null
  glasses: string | null
  topColor: string | null
  bottomColor: string | null
}

const spring = { type: 'spring' as const, stiffness: 110, damping: 22 }
const rowVariants = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } }
const itemVariants = {
  hidden: { opacity: 0, scale: 0.88 },
  show: { opacity: 1, scale: 1, transition: spring },
}

// ─── Option row ───────────────────────────────────────────────────────────────

function OptionRow({
  label, options, selectedId, onSelect,
}: {
  label: string
  options: Option[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: 'var(--color-muted)' }}>
        {label}
      </p>
      <motion.div
        className="flex gap-2 pb-1"
        variants={rowVariants}
        initial="hidden"
        animate="show"
        style={{ overflowX: 'auto', scrollbarWidth: 'none' }}
      >
        {options.map((item) => (
          <motion.button
            key={item.id}
            variants={itemVariants}
            type="button"
            onClick={() => onSelect(item.id)}
            whileTap={{ scale: 0.9 }}
            className="flex-shrink-0 flex flex-col items-center gap-1.5 rounded-[1.2rem] border transition-all"
            style={{
              width: 64,
              padding: '7px 5px 6px',
              ...(selectedId === item.id
                ? { borderColor: 'var(--color-accent)', background: 'var(--color-accent-light)', boxShadow: '0 0 0 3px rgba(5,150,105,0.12)' }
                : { borderColor: 'var(--color-border-light)', background: '#fafaf9' }),
            }}
          >
            <img src={item.image} alt={item.label} style={{ width: 36, height: 36, objectFit: 'contain' }} />
            <span
              className="text-[10px] font-semibold leading-none"
              style={{ color: selectedId === item.id ? 'var(--color-accent)' : 'var(--color-muted)' }}
            >
              {item.label}
            </span>
          </motion.button>
        ))}
      </motion.div>
    </div>
  )
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div
      className="h-[100dvh] overflow-hidden flex items-center justify-center relative"
      style={{ background: 'linear-gradient(145deg, #ecfdf5 0%, #f8faf9 55%, #fafaf9 100%)' }}
    >
      <div
        className="flex overflow-hidden"
        style={{ width: '90%', maxWidth: 900, height: '84dvh', borderRadius: '2.5rem' }}
      >
        <div className="w-[38%] skeleton-shimmer" />
        <div className="flex-1 flex flex-col gap-4 p-7" style={{ background: 'white' }}>
          <div className="h-14 w-48 rounded-2xl skeleton-shimmer" />
          <div className="h-32 rounded-[1.5rem] skeleton-shimmer" />
          <div className="flex-1 rounded-[1.5rem] skeleton-shimmer" />
          <div className="h-12 rounded-full skeleton-shimmer" />
        </div>
      </div>
    </div>
  )
}

// ─── AvatarPage ───────────────────────────────────────────────────────────────

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

  const canSubmit = useMemo(() => !!nickname.trim() && !!gender && !saving, [nickname, gender, saving])

  async function fetchComponent(type: 'hair' | 'glasses' | 'top' | 'bottom', id: string) {
    const data = await getJson<ComponentResponse>(`/api/avatar/component?type=${type}&id=${id}`)
    return data.image
  }

  useEffect(() => {
    async function load() {
      setError('')
      try {
        const [base, opts, current] = await Promise.all([
          getJson<BaseResponse>('/api/avatar/base'),
          getJson<OptionsResponse>('/api/avatar/options'),
          getJson<CurrentAvatarResponse>('/api/avatar/current').catch(() => null),
        ])
        setBaseImage(base.image)
        setOptions(opts)

        const initHair = current?.hairStyle || opts.hair[0]?.id || ''
        const initGlasses = current?.glasses || opts.glasses.find((g) => g.id === 'none')?.id || opts.glasses[0]?.id || ''
        const initTop = current?.topColor || opts.topColors[0]?.id || ''
        const initBottom = current?.bottomColor || opts.bottomColors[0]?.id || ''

        if (current?.nickname) setNickname(current.nickname)
        if (current?.gender === 'male' || current?.gender === 'female') setGender(current.gender)
        setHairId(initHair)
        setGlassesId(initGlasses)
        setTopId(initTop)
        setBottomId(initBottom)

        const [h, g, t, b] = await Promise.all([
          initHair ? fetchComponent('hair', initHair) : Promise.resolve(''),
          initGlasses ? fetchComponent('glasses', initGlasses) : Promise.resolve(''),
          initTop ? fetchComponent('top', initTop) : Promise.resolve(''),
          initBottom ? fetchComponent('bottom', initBottom) : Promise.resolve(''),
        ])
        setHairImage(h)
        setGlassesImage(g)
        setTopImage(t)
        setBottomImage(b)
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载失败')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function onSelectHair(id: string) {
    setHairId(id)
    try { setHairImage(await fetchComponent('hair', id)) }
    catch { /* ignore */ }
  }
  async function onSelectGlasses(id: string) {
    setGlassesId(id)
    try { setGlassesImage(await fetchComponent('glasses', id)) }
    catch { /* ignore */ }
  }
  async function onSelectTop(id: string) {
    setTopId(id)
    try { setTopImage(await fetchComponent('top', id)) }
    catch { /* ignore */ }
  }
  async function onSelectBottom(id: string) {
    setBottomId(id)
    try { setBottomImage(await fetchComponent('bottom', id)) }
    catch { /* ignore */ }
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
          ? (e as { message: string }).message : '提交失败'
      setError(message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingSkeleton />

  return (
    <div
      className="h-[100dvh] overflow-hidden flex items-center justify-center relative"
      style={{ background: 'linear-gradient(145deg, #ecfdf5 0%, #f8faf9 55%, #fafaf9 100%)' }}
    >
      {/* Decorative blobs */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: -120, right: -80, width: 500, height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(5,150,105,0.07) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: -140, left: '15%', width: 600, height: 600,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(5,150,105,0.04) 0%, transparent 70%)',
        }}
      />

      {/* Main card */}
      <motion.form
        onSubmit={onSubmit}
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={spring}
        className="relative flex overflow-hidden"
        style={{
          width: '90%',
          maxWidth: 900,
          height: '84dvh',
          borderRadius: '2.5rem',
          boxShadow: '0 40px 100px -20px rgba(0,0,0,0.13), 0 0 0 1px rgba(231,229,228,0.5)',
        }}
      >
        {/* ── Left: Avatar preview ── */}
        <div
          className="w-[38%] relative flex flex-col shrink-0 overflow-hidden"
          style={{ background: 'linear-gradient(160deg, #ecfdf5 0%, #f0fdf4 40%, #ffffff 90%)' }}
        >
          {/* Decoration dots */}
          <div className="absolute top-5 right-6 flex gap-1.5 pointer-events-none z-10">
            {[0.7, 0.45, 0.25].map((o, i) => (
              <div key={i} className="w-2 h-2 rounded-full" style={{ background: `rgba(5,150,105,${o})` }} />
            ))}
          </div>

          {/* Preview badge */}
          <div className="absolute top-5 left-5 z-10">
            <div
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5"
              style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(8px)', border: '1px solid rgba(5,150,105,0.12)' }}
            >
              <Sparkle size={10} weight="fill" style={{ color: 'var(--color-accent)' }} />
              <span className="text-[10px] font-bold" style={{ color: 'var(--color-accent)' }}>预览</span>
            </div>
          </div>

          {/* Avatar layers */}
          <div className="relative flex-1 min-h-0">
            {baseImage && <img src={baseImage} alt="base" className="absolute inset-0 w-full h-full object-cover" />}
            {topImage && <img src={topImage} alt="top" className="absolute inset-0 w-full h-full object-cover" />}
            {bottomImage && <img src={bottomImage} alt="bottom" className="absolute inset-0 w-full h-full object-cover" />}
            {hairImage && <img src={hairImage} alt="hair" className="absolute inset-0 w-full h-full object-cover" />}
            {glassesImage && <img src={glassesImage} alt="glasses" className="absolute inset-0 w-full h-full object-cover" />}
            <div
              className="absolute bottom-0 inset-x-0 h-32 pointer-events-none"
              style={{ background: 'linear-gradient(to top, #f0fdf4, transparent)' }}
            />
          </div>

          {/* Nickname pill */}
          <div className="relative z-10 shrink-0 px-5 pb-6 text-center">
            <div
              className="inline-block rounded-full px-6 py-2.5 text-sm font-bold transition-all"
              style={{
                background: nickname ? 'var(--color-accent-light)' : 'rgba(231,229,228,0.5)',
                color: nickname ? 'var(--color-accent)' : 'var(--color-muted)',
                boxShadow: nickname ? '0 4px 16px rgba(5,150,105,0.18)' : 'none',
              }}
            >
              {nickname || '我的形象'}
            </div>
          </div>
        </div>

        {/* ── Right: Form ── */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ background: 'white' }}>

          {/* Fixed header */}
          <div className="shrink-0 px-8 pt-7 pb-5" style={{ borderBottom: '1px solid var(--color-border-light)' }}>
            <div className="flex items-center gap-2 mb-2">
              <div
                className="flex items-center justify-center shrink-0"
                style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--color-accent-light)' }}
              >
                <Sparkle size={12} weight="fill" style={{ color: 'var(--color-accent)' }} />
              </div>
              <span className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--color-accent)' }}>
                形象设置
              </span>
            </div>
            <h2 className="text-xl font-black tracking-tight" style={{ color: 'var(--color-foreground)' }}>
              创建你的专属形象
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
              起个昵称、选择外观，开始你的食育之旅
            </p>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 min-h-0 overflow-y-auto px-8 py-5 space-y-4" style={{ scrollbarWidth: 'none' }}>

            {/* Basic info */}
            <div
              className="rounded-[1.8rem] p-5 space-y-4"
              style={{
                background: '#fafaf9',
                border: '1px solid var(--color-border-light)',
              }}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">👤</span>
                <span className="text-xs font-bold tracking-wide" style={{ color: 'var(--color-muted)' }}>基本信息</span>
              </div>

              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="给自己起一个昵称"
                className="form-input"
              />

              <div className="flex gap-2.5">
                {[
                  { value: 'male' as const, label: '男孩', emoji: '👦' },
                  { value: 'female' as const, label: '女孩', emoji: '👧' },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setGender(item.value)}
                    className="flex-1 py-2.5 rounded-2xl text-sm font-semibold border transition-all active:scale-[0.97]"
                    style={
                      gender === item.value
                        ? { borderColor: 'var(--color-accent)', background: 'var(--color-accent-light)', color: 'var(--color-accent)' }
                        : { borderColor: 'var(--color-border-light)', background: 'white', color: 'var(--color-foreground)' }
                    }
                  >
                    {item.emoji} {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Style options */}
            {options && (
              <div
                className="rounded-[1.8rem] p-5 space-y-4"
                style={{
                  background: '#fafaf9',
                  border: '1px solid var(--color-border-light)',
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">🎨</span>
                  <span className="text-xs font-bold tracking-wide" style={{ color: 'var(--color-muted)' }}>形象定制</span>
                </div>
                <OptionRow label="发型" options={options.hair} selectedId={hairId} onSelect={onSelectHair} />
                <OptionRow label="眼镜" options={options.glasses} selectedId={glassesId} onSelect={onSelectGlasses} />
                <OptionRow label="上衣颜色" options={options.topColors} selectedId={topId} onSelect={onSelectTop} />
                <OptionRow label="下装颜色" options={options.bottomColors} selectedId={bottomId} onSelect={onSelectBottom} />
              </div>
            )}

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  key="err"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-sm px-4 py-3 rounded-2xl"
                  style={{ color: 'var(--color-error)', background: 'var(--color-error-light)' }}
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Fixed footer: submit */}
          <div className="shrink-0 px-8 py-5" style={{ borderTop: '1px solid var(--color-border-light)' }}>
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full py-3.5 rounded-full font-bold text-sm text-white transition-all active:scale-[0.98]"
              style={{
                background: canSubmit ? 'linear-gradient(135deg, #059669, #047857)' : 'var(--color-warm-200)',
                color: canSubmit ? 'white' : 'var(--color-muted)',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                border: 'none',
                boxShadow: canSubmit ? '0 8px 24px -4px rgba(5,150,105,0.38)' : 'none',
              }}
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <SpinnerGap size={15} weight="bold" className="animate-spin" />
                  保存中…
                </span>
              ) : '保存并进入 →'}
            </button>
          </div>
        </div>
      </motion.form>
    </div>
  )
}
