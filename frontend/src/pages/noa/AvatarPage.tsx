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
type CurrentAvatarResponse = {
  nickname: string
  gender: string
  hairStyle: string | null
  glasses: string | null
  topColor: string | null
  bottomColor: string | null
}

const spring = { type: 'spring' as const, stiffness: 100, damping: 20 }

const itemVariants = {
  hidden: { opacity: 0, scale: 0.88 },
  show: { opacity: 1, scale: 1, transition: spring },
}
const rowVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
}

// ─── Option row (horizontal scroll) ──────────────────────────────────────────

function OptionRow({
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
      <p className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: 'var(--color-muted)' }}>
        {label}
      </p>
      <motion.div
        className="flex gap-2.5 pb-1"
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
              width: 68,
              padding: '8px 6px 7px',
              ...(selectedId === item.id
                ? {
                    borderColor: 'var(--color-accent)',
                    background: 'var(--color-accent-light)',
                    boxShadow: '0 0 0 3px rgba(5,150,105,0.12)',
                  }
                : {
                    borderColor: 'var(--color-border-light)',
                    background: '#fafaf9',
                  }),
            }}
          >
            <img
              src={item.image}
              alt={item.label}
              style={{ width: 40, height: 40, objectFit: 'contain' }}
            />
            <span
              className="text-[10px] font-semibold leading-none"
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
        // Try loading existing avatar selections (edit mode) + options + base in parallel
        const [base, opts, current] = await Promise.all([
          getJson<BaseResponse>('/api/avatar/base'),
          getJson<OptionsResponse>('/api/avatar/options'),
          getJson<CurrentAvatarResponse>('/api/avatar/current').catch(() => null),
        ])
        setBaseImage(base.image)
        setOptions(opts)

        // Pre-populate from existing avatar or use defaults
        const initHair = current?.hairStyle || opts.hair[0]?.id || ''
        const initGlasses =
          current?.glasses ||
          opts.glasses.find((g) => g.id === 'none')?.id ||
          opts.glasses[0]?.id ||
          ''
        const initTop = current?.topColor || opts.topColors[0]?.id || ''
        const initBottom = current?.bottomColor || opts.bottomColors[0]?.id || ''

        if (current?.nickname) setNickname(current.nickname)
        if (current?.gender === 'male' || current?.gender === 'female') {
          setGender(current.gender)
        }
        setHairId(initHair)
        setGlassesId(initGlasses)
        setTopId(initTop)
        setBottomId(initBottom)

        const [hairRes, glassesRes, topRes, bottomRes] = await Promise.all([
          initHair ? fetchComponent('hair', initHair) : Promise.resolve(''),
          initGlasses ? fetchComponent('glasses', initGlasses) : Promise.resolve(''),
          initTop ? fetchComponent('top', initTop) : Promise.resolve(''),
          initBottom ? fetchComponent('bottom', initBottom) : Promise.resolve(''),
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
    <div
      className="h-[100dvh] overflow-hidden flex flex-col relative"
      style={{ background: 'linear-gradient(145deg, #ecfdf5 0%, #f8faf9 55%, #fafaf9 100%)' }}
    >
      {/* ── Decorative background blobs ── */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: -80, right: -80, width: 400, height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(5,150,105,0.07) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: -100, left: '30%', width: 500, height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(5,150,105,0.04) 0%, transparent 70%)',
        }}
      />

      {/* ── Header ── */}
      <header
        className="relative z-10 shrink-0 h-14 flex items-center px-6 gap-3"
        style={{
          background: 'rgba(236,253,245,0.85)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(5,150,105,0.1)',
        }}
      >
        <div
          className="flex items-center justify-center w-7 h-7 rounded-full shrink-0"
          style={{ background: 'var(--color-accent)' }}
        >
          <span className="text-white text-xs">✦</span>
        </div>
        <span className="font-bold tracking-tight" style={{ color: 'var(--color-foreground)' }}>
          创建你的专属形象
        </span>
      </header>

      {loading ? (
        /* ── Skeleton ── */
        <div className="flex-1 min-h-0 flex gap-4 p-4 pt-3">
          <div className="w-[36%] rounded-[2.5rem] skeleton-shimmer" />
          <div className="flex-1 flex flex-col gap-3">
            <div className="h-36 rounded-[2rem] skeleton-shimmer" />
            <div className="flex-1 rounded-[2rem] skeleton-shimmer" />
            <div className="h-14 rounded-full skeleton-shimmer" />
          </div>
        </div>
      ) : (
        <form
          onSubmit={onSubmit}
          className="relative z-10 flex-1 min-h-0 flex gap-4 p-4 pt-3"
        >
          {/* ── Left: Avatar preview card ── */}
          <motion.div
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={spring}
            className="w-[36%] relative overflow-hidden rounded-[2.5rem] flex flex-col"
            style={{
              background: 'white',
              boxShadow: '0 24px 56px -12px rgba(0,0,0,0.09), 0 0 0 1px rgba(5,150,105,0.08)',
            }}
          >
            {/* Soft gradient inside */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'linear-gradient(160deg, #ecfdf5 0%, #f0fdf4 35%, #ffffff 75%)',
              }}
            />

            {/* Floating dots decoration */}
            <div className="absolute top-5 right-6 flex gap-1.5 pointer-events-none">
              {[0.8, 0.5, 0.3].map((o, i) => (
                <div
                  key={i}
                  className="w-2 h-2 rounded-full"
                  style={{ background: `rgba(5,150,105,${o})` }}
                />
              ))}
            </div>

            {/* Avatar layers */}
            <div className="relative flex-1 min-h-0">
              {baseImage && (
                <img src={baseImage} alt="base" className="absolute inset-0 w-full h-full object-cover" />
              )}
              {topImage && (
                <img src={topImage} alt="top" className="absolute inset-0 w-full h-full object-cover" />
              )}
              {bottomImage && (
                <img src={bottomImage} alt="bottom" className="absolute inset-0 w-full h-full object-cover" />
              )}
              {hairImage && (
                <img src={hairImage} alt="hair" className="absolute inset-0 w-full h-full object-cover" />
              )}
              {glassesImage && (
                <img src={glassesImage} alt="glasses" className="absolute inset-0 w-full h-full object-cover" />
              )}
              {/* Bottom fade overlay */}
              <div
                className="absolute bottom-0 inset-x-0 h-28 pointer-events-none"
                style={{ background: 'linear-gradient(to top, white, transparent)' }}
              />
            </div>

            {/* Nickname bubble */}
            <div className="relative z-10 shrink-0 px-5 pb-5 text-center">
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
          </motion.div>

          {/* ── Right: Form ── */}
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ ...spring, delay: 0.06 }}
            className="flex-1 min-w-0 flex flex-col gap-3 overflow-y-auto"
            style={{ scrollbarWidth: 'none' }}
          >
            {/* Basic info card */}
            <div
              className="shrink-0 rounded-[2rem] p-5 space-y-4"
              style={{
                background: 'white',
                boxShadow: '0 8px 28px -8px rgba(0,0,0,0.06), 0 0 0 1px rgba(231,229,228,0.6)',
              }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: 'var(--color-accent-light)' }}
                >
                  <span className="text-sm">👤</span>
                </div>
                <span className="text-sm font-bold tracking-tight" style={{ color: 'var(--color-foreground)' }}>
                  基本信息
                </span>
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
                        ? {
                            borderColor: 'var(--color-accent)',
                            background: 'var(--color-accent-light)',
                            color: 'var(--color-accent)',
                          }
                        : {
                            borderColor: 'var(--color-border-light)',
                            background: '#fafaf9',
                            color: 'var(--color-foreground)',
                          }
                    }
                  >
                    {item.emoji} {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Style options card */}
            {options && (
              <div
                className="shrink-0 rounded-[2rem] p-5 space-y-4"
                style={{
                  background: 'white',
                  boxShadow: '0 8px 28px -8px rgba(0,0,0,0.06), 0 0 0 1px rgba(231,229,228,0.6)',
                }}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'var(--color-accent-light)' }}
                  >
                    <span className="text-sm">🎨</span>
                  </div>
                  <span className="text-sm font-bold tracking-tight" style={{ color: 'var(--color-foreground)' }}>
                    形象定制
                  </span>
                </div>

                <OptionRow
                  label="发型"
                  options={options.hair}
                  selectedId={hairId}
                  onSelect={onSelectHair}
                />
                <OptionRow
                  label="眼镜"
                  options={options.glasses}
                  selectedId={glassesId}
                  onSelect={onSelectGlasses}
                />
                <OptionRow
                  label="上衣颜色"
                  options={options.topColors}
                  selectedId={topId}
                  onSelect={onSelectTop}
                />
                <OptionRow
                  label="下装颜色"
                  options={options.bottomColors}
                  selectedId={bottomId}
                  onSelect={onSelectBottom}
                />
              </div>
            )}

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="shrink-0 text-sm px-4 py-3 rounded-2xl"
                  style={{
                    color: 'var(--color-error)',
                    background: 'var(--color-error-light)',
                  }}
                >
                  {error}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit */}
            <motion.button
              type="submit"
              disabled={!canSubmit}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.14 }}
              whileTap={canSubmit ? { scale: 0.97 } : undefined}
              className="shrink-0 w-full py-4 rounded-full font-bold text-sm text-white transition-all"
              style={{
                background: canSubmit
                  ? 'linear-gradient(135deg, #059669, #047857)'
                  : 'var(--color-muted)',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                boxShadow: canSubmit
                  ? '0 10px 28px -4px rgba(5,150,105,0.42)'
                  : 'none',
                border: 'none',
              }}
            >
              {saving ? (
                <span className="flex items-center justify-center gap-2">
                  <SpinnerGap size={16} weight="bold" className="animate-spin" />
                  保存中…
                </span>
              ) : (
                '保存并返回 →'
              )}
            </motion.button>
          </motion.div>
        </form>
      )}
    </div>
  )
}
