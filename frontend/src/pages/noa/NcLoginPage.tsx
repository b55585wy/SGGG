import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { postJson } from '@/lib/ncApi'
import { setToken } from '@/lib/auth'
import { BookOpenText, ArrowRight, Sparkle } from '@phosphor-icons/react'

type LoginResponse = {
  token: string
  user: { userID: string }
  firstLogin: boolean
}

const spring = { type: 'spring' as const, stiffness: 110, damping: 22 }

const FEATURES = [
  { emoji: '🧒', text: '个性化虚拟形象' },
  { emoji: '📖', text: '智能绘本生成' },
  { emoji: '🥦', text: '进食行为追踪' },
]

export default function NcLoginPage() {
  const navigate = useNavigate()
  const [userID, setUserID] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    sessionStorage.removeItem('homeFeedbackText')
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const data = await postJson<LoginResponse>('/api/auth/login', { userID, password })
      setToken(data.token)
      navigate(data.firstLogin ? '/noa/avatar' : '/noa/home', { replace: true })
    } catch (err) {
      const message =
        err && typeof err === 'object' && 'message' in err &&
        typeof (err as { message?: unknown }).message === 'string'
          ? (err as { message: string }).message
          : '登录失败'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const canSubmit = !!userID && !!password && !loading

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
          bottom: -140, left: '10%', width: 600, height: 600,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(5,150,105,0.04) 0%, transparent 70%)',
        }}
      />

      {/* Main card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={spring}
        className="relative flex overflow-hidden w-[92%] lg:w-[88%]"
        style={{
          maxWidth: 820,
          height: '72dvh',
          minHeight: 400,
          borderRadius: '2.5rem',
          boxShadow: '0 40px 100px -20px rgba(0,0,0,0.13), 0 0 0 1px rgba(231,229,228,0.5)',
        }}
      >
        {/* ── Left: Branding panel ── */}
        <div
          className="hidden lg:flex w-[42%] relative flex-col items-center justify-center px-10 shrink-0 overflow-hidden"
          style={{ background: 'linear-gradient(160deg, #059669 0%, #047857 55%, #065f46 100%)' }}
        >
          {/* Decorative circles */}
          <div
            className="absolute pointer-events-none"
            style={{
              top: -60, left: -60, width: 260, height: 260,
              borderRadius: '50%', background: 'rgba(255,255,255,0.06)',
            }}
          />
          <div
            className="absolute pointer-events-none"
            style={{
              bottom: -80, right: -40, width: 320, height: 320,
              borderRadius: '50%', background: 'rgba(255,255,255,0.04)',
            }}
          />
          <div
            className="absolute pointer-events-none"
            style={{
              top: '30%', right: -30, width: 120, height: 120,
              borderRadius: '50%', background: 'rgba(255,255,255,0.05)',
            }}
          />

          {/* Content */}
          <div className="relative z-10 flex flex-col items-center text-center gap-6">
            {/* Icon */}
            <div
              className="flex items-center justify-center"
              style={{
                width: 72, height: 72,
                borderRadius: '1.5rem',
                background: 'rgba(255,255,255,0.18)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.25)',
              }}
            >
              <BookOpenText size={34} weight="duotone" style={{ color: 'white' }} />
            </div>

            {/* Title */}
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white">食育绘本</h1>
              <p className="mt-1.5 text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.65)', maxWidth: '22ch' }}>
                通过互动故事，让每个孩子爱上健康饮食
              </p>
            </div>

            {/* Features */}
            <div className="flex flex-col gap-2.5 w-full">
              {FEATURES.map(({ emoji, text }, i) => (
                <motion.div
                  key={text}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...spring, delay: 0.12 + i * 0.06 }}
                  className="flex items-center gap-3 rounded-2xl px-4 py-2.5"
                  style={{ background: 'rgba(255,255,255,0.10)', border: '1px solid rgba(255,255,255,0.12)' }}
                >
                  <span className="text-base leading-none">{emoji}</span>
                  <span className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.85)' }}>{text}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right: Login form ── */}
        <div
          className="flex-1 flex flex-col items-center justify-center px-6 lg:px-10"
          style={{ background: 'white' }}
        >
          <div className="w-full" style={{ maxWidth: 320 }}>
            {/* Header */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.08 }}
              className="mb-8"
            >
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="flex items-center justify-center shrink-0"
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: 'var(--color-accent-light)',
                  }}
                >
                  <Sparkle size={13} weight="fill" style={{ color: 'var(--color-accent)' }} />
                </div>
                <span className="text-xs font-bold tracking-widest uppercase" style={{ color: 'var(--color-accent)' }}>
                  欢迎回来
                </span>
              </div>
              <h2 className="text-xl font-black tracking-tight" style={{ color: 'var(--color-foreground)' }}>
                登录你的账号
              </h2>
              <p className="text-sm mt-1" style={{ color: 'var(--color-muted)' }}>
                输入账号信息以继续
              </p>
            </motion.div>

            {/* Form */}
            <motion.form
              onSubmit={onSubmit}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...spring, delay: 0.14 }}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>
                  用户 ID
                </label>
                <input
                  value={userID}
                  onChange={(e) => setUserID(e.target.value)}
                  autoComplete="username"
                  placeholder="请输入用户 ID"
                  className="form-input"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold" style={{ color: 'var(--color-muted)' }}>
                  密码
                </label>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete="current-password"
                  placeholder="请输入密码"
                  className="form-input"
                />
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="rounded-2xl px-4 py-2.5 text-sm"
                  style={{ background: 'var(--color-error-light)', color: 'var(--color-error)' }}
                >
                  {error}
                </motion.div>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="w-full py-3.5 rounded-full font-bold text-sm text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                style={{
                  background: canSubmit
                    ? 'linear-gradient(135deg, #059669, #047857)'
                    : 'var(--color-warm-200)',
                  color: canSubmit ? 'white' : 'var(--color-muted)',
                  border: 'none',
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  boxShadow: canSubmit ? '0 8px 24px -4px rgba(5,150,105,0.38)' : 'none',
                }}
              >
                {loading ? '登录中…' : (
                  <>
                    登录
                    <ArrowRight size={15} weight="bold" />
                  </>
                )}
              </button>
            </motion.form>

            {/* Admin link */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-6 text-center"
            >
              <button
                type="button"
                onClick={() => navigate('/noa/admin/users')}
                className="text-xs transition-colors"
                style={{ color: 'var(--color-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                管理员入口
              </button>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
