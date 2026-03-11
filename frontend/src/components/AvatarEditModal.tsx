import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SpinnerGap, X } from '@phosphor-icons/react'
import { getJson, postJson } from '@/lib/ncApi'
import { basicAvatarDefaults, basicAvatarOptions, buildBasicAvatarImageSrc, type BasicAvatarColor, type BasicAvatarGender, type BasicAvatarGlasses, type BasicAvatarShirt, type BasicAvatarUnderdress } from '@/lib/basicAvatar'

type CurrentAvatarResponse = {
  nickname: string
  gender: BasicAvatarGender
  color: BasicAvatarColor
  shirt: BasicAvatarShirt
  underdress: BasicAvatarUnderdress
  glasses: BasicAvatarGlasses
}

const spring = { type: 'spring' as const, stiffness: 110, damping: 22 }

const rowVariants = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } }
const itemVariants = {
  hidden: { opacity: 0, scale: 0.88 },
  show: { opacity: 1, scale: 1, transition: spring },
}

function OptionRow({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string
  options: Array<{ value: string; label: string; icon: string }>
  selected: string
  onSelect: (value: string) => void
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
            key={item.value}
            variants={itemVariants}
            type="button"
            onClick={() => onSelect(item.value)}
            whileTap={{ scale: 0.9 }}
            className="flex-shrink-0 flex flex-col items-center gap-1.5 rounded-[1.1rem] border transition-all"
            style={{
              width: 62,
              padding: '7px 5px 6px',
              ...(selected === item.value
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
            <img src={item.icon} alt={item.label} style={{ width: 36, height: 36, objectFit: 'contain' }} />
            <span
              className="text-[10px] font-semibold leading-none"
              style={{ color: selected === item.value ? 'var(--color-accent)' : 'var(--color-muted)' }}
            >
              {item.label}
            </span>
          </motion.button>
        ))}
      </motion.div>
    </div>
  )
}

export type AvatarEditModalProps = {
  onClose: () => void
  onSaved: () => void
}

export default function AvatarEditModal({ onClose, onSaved }: AvatarEditModalProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [nickname, setNickname] = useState('')
  const [gender, setGender] = useState<BasicAvatarGender>(basicAvatarDefaults.gender)
  const [color, setColor] = useState<BasicAvatarColor>(basicAvatarDefaults.color)
  const [shirt, setShirt] = useState<BasicAvatarShirt>(basicAvatarDefaults.shirt)
  const [underdress, setUnderdress] = useState<BasicAvatarUnderdress>(basicAvatarDefaults.underdress)
  const [glasses, setGlasses] = useState<BasicAvatarGlasses>(basicAvatarDefaults.glasses)

  const canSave = useMemo(() => !!nickname.trim() && !saving, [nickname, saving])

  useEffect(() => {
    async function load() {
      try {
        const current = await getJson<CurrentAvatarResponse>('/api/avatar/current').catch(() => null)

        if (current?.nickname) setNickname(current.nickname)
        if (current?.gender) setGender(current.gender)
        if (current?.color) setColor(current.color)
        if (current?.shirt) setShirt(current.shirt)
        if (current?.underdress) setUnderdress(current.underdress)
        if (current?.glasses) setGlasses(current.glasses)
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载失败')
      } finally {
        setLoading(false)
      }
    }
    void load()
  }, [])

  async function onSave(e: React.FormEvent) {
    e.preventDefault()
    if (!nickname.trim()) { setError('昵称不能为空'); return }
    setError('')
    setSaving(true)
    try {
      await postJson('/api/avatar/save', {
        nickname: nickname.trim(),
        gender,
        color,
        shirt,
        underdress,
        glasses,
      })
      onSaved()
    } catch (e) {
      const message =
        e && typeof e === 'object' && 'message' in e &&
        typeof (e as { message?: unknown }).message === 'string'
          ? (e as { message: string }).message
          : '保存失败'
      setError(message)
    } finally {
      setSaving(false)
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
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(6px)' }}
        onClick={onClose}
      />

      {/* Centered card */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none">
        <motion.div
          key="dialog"
          initial={{ opacity: 0, scale: 0.93, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.93, y: -10 }}
          transition={spring}
          className="pointer-events-auto flex flex-col w-full overflow-hidden"
          style={{
            maxWidth: 860,
            maxHeight: '84dvh',
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
                <span className="text-sm">✦</span>
              </div>
              <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--color-foreground)' }}>
                编辑形象
              </h2>
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

          {loading ? (
            /* Skeleton */
            <div className="flex-1 flex gap-5 p-6">
              <div className="w-[34%] rounded-[2rem] skeleton-shimmer" />
              <div className="flex-1 flex flex-col gap-3">
                <div className="h-28 rounded-[1.5rem] skeleton-shimmer" />
                <div className="flex-1 rounded-[1.5rem] skeleton-shimmer" />
              </div>
            </div>
          ) : (
            <form onSubmit={onSave} className="flex-1 min-h-0 flex gap-5 p-6">

              {/* Left: Avatar preview */}
              <div
                className="w-[34%] relative overflow-hidden rounded-[2rem] flex flex-col shrink-0"
                style={{
                  background: 'linear-gradient(160deg, #ecfdf5 0%, #f0fdf4 40%, #ffffff 80%)',
                  boxShadow: '0 0 0 1px rgba(5,150,105,0.08)',
                }}
              >
                {/* Dots */}
                <div className="absolute top-4 right-5 flex gap-1.5 pointer-events-none">
                  {[0.8, 0.5, 0.3].map((o, i) => (
                    <div key={i} className="w-2 h-2 rounded-full" style={{ background: `rgba(5,150,105,${o})` }} />
                  ))}
                </div>

                {/* Avatar layers */}
                <div className="relative flex-1 min-h-0">
                  <img
                    src={buildBasicAvatarImageSrc({ gender, color, shirt, underdress, glasses })}
                    alt="avatar"
                    className="absolute inset-0 w-full h-full object-contain"
                  />
                </div>

                {/* Nickname badge */}
                <div className="relative z-10 shrink-0 px-4 pb-4 text-center">
                  <div
                    className="inline-block rounded-full px-5 py-2 text-sm font-bold transition-all"
                    style={{
                      background: nickname ? 'var(--color-accent-light)' : 'rgba(231,229,228,0.5)',
                      color: nickname ? 'var(--color-accent)' : 'var(--color-muted)',
                      boxShadow: nickname ? '0 4px 14px rgba(5,150,105,0.18)' : 'none',
                    }}
                  >
                    {nickname || '我的形象'}
                  </div>
                </div>
              </div>

              {/* Right: Form */}
              <div className="flex-1 min-w-0 flex flex-col gap-3 overflow-y-auto" style={{ scrollbarWidth: 'none' }}>

                {/* Basic info */}
                <div
                  className="shrink-0 rounded-[1.8rem] p-4 space-y-3"
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
                  <div className="flex gap-2">
                    {basicAvatarOptions.gender.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setGender(item.value)}
                        className="flex-1 py-2 rounded-2xl text-sm font-semibold border transition-all active:scale-[0.97]"
                        style={
                          gender === item.value
                            ? { borderColor: 'var(--color-accent)', background: 'var(--color-accent-light)', color: 'var(--color-accent)' }
                            : { borderColor: 'var(--color-border-light)', background: 'white', color: 'var(--color-foreground)' }
                        }
                      >
                        <span className="inline-flex items-center justify-center gap-2">
                          <img src={item.icon} alt="" style={{ width: 18, height: 18, objectFit: 'contain' }} />
                          {item.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Style options */}
                <div
                  className="shrink-0 rounded-[1.8rem] p-4 space-y-3"
                  style={{
                    background: '#fafaf9',
                    border: '1px solid var(--color-border-light)',
                  }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🎨</span>
                    <span className="text-xs font-bold tracking-wide" style={{ color: 'var(--color-muted)' }}>形象定制</span>
                  </div>
                  <OptionRow label="颜色" options={basicAvatarOptions.color} selected={color} onSelect={(v) => setColor(v as BasicAvatarColor)} />
                  <OptionRow label="上衣" options={basicAvatarOptions.shirt} selected={shirt} onSelect={(v) => setShirt(v as BasicAvatarShirt)} />
                  <OptionRow label="下装" options={basicAvatarOptions.underdress} selected={underdress} onSelect={(v) => setUnderdress(v as BasicAvatarUnderdress)} />
                  <OptionRow label="眼镜" options={basicAvatarOptions.glasses} selected={glasses} onSelect={(v) => setGlasses(v as BasicAvatarGlasses)} />
                </div>

                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      key="err"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="shrink-0 text-sm px-4 py-3 rounded-2xl"
                      style={{ color: 'var(--color-error)', background: 'var(--color-error-light)' }}
                    >
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Save button */}
                <button
                  type="submit"
                  disabled={!canSave}
                  className="shrink-0 w-full py-3.5 rounded-full font-bold text-sm text-white transition-all active:scale-[0.98]"
                  style={{
                    background: canSave
                      ? 'linear-gradient(135deg, #059669, #047857)'
                      : 'var(--color-muted)',
                    cursor: canSave ? 'pointer' : 'not-allowed',
                    border: 'none',
                    boxShadow: canSave ? '0 8px 24px -4px rgba(5,150,105,0.38)' : 'none',
                  }}
                >
                  {saving ? (
                    <span className="flex items-center justify-center gap-2">
                      <SpinnerGap size={15} weight="bold" className="animate-spin" />
                      保存中…
                    </span>
                  ) : '保存并返回 →'}
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </div>
    </>
  )
}
