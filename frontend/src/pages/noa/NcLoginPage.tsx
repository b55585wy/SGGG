import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { postJson } from '@/lib/ncApi'
import { setToken } from '@/lib/auth'
import { SignIn, BookOpen, Star } from '@phosphor-icons/react'

type LoginResponse = {
  token: string
  user: { userID: string }
  firstLogin: boolean
}

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
      const data = await postJson<LoginResponse>('/api/auth/login', {
        userID,
        password,
      })
      setToken(data.token)
      navigate(data.firstLogin ? '/noa/avatar' : '/noa/home', { replace: true })
    } catch (err) {
      const message =
        err &&
        typeof err === 'object' &&
        'message' in err &&
        typeof (err as { message?: unknown }).message === 'string'
          ? (err as { message: string }).message
          : '登录失败'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-[100dvh] grid-cols-1 md:grid-cols-[1fr_1fr]">
      {/* Left: Branding panel */}
      <div className="relative hidden overflow-hidden bg-accent md:flex md:flex-col md:items-center md:justify-center">
        {/* Decorative shapes */}
        <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-white/10" />
        <div className="absolute -bottom-16 -right-16 h-64 w-64 rounded-full bg-white/[0.07]" />
        <div className="absolute right-12 top-16 h-32 w-32 rounded-[2rem] bg-white/[0.05] rotate-12" />

        <div className="relative z-10 px-12 text-center">
          <div className="mx-auto mb-8 flex h-20 w-20 items-center justify-center rounded-[1.5rem]
                          bg-white/20 backdrop-blur-sm">
            <BookOpen size={40} weight="duotone" className="text-white" />
          </div>
          <h2 className="mb-3 text-3xl font-semibold tracking-tight text-white">
            食育绘本
          </h2>
          <p className="mx-auto max-w-[28ch] text-sm leading-relaxed text-white/70">
            通过互动故事，让每个孩子爱上健康饮食
          </p>

          {/* Feature highlights */}
          <div className="mt-10 space-y-4">
            {[
              '个性化虚拟形象',
              '智能绘本生成',
              '进食行为追踪',
            ].map((text) => (
              <div key={text} className="flex items-center justify-center gap-2.5">
                <Star size={14} weight="fill" className="text-white/50" />
                <span className="text-sm text-white/60">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right: Login form */}
      <div className="flex flex-col items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-[380px]">
          {/* Mobile-only header */}
          <div className="mb-10 flex items-center gap-3 md:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent">
              <BookOpen size={22} weight="duotone" className="text-white" />
            </div>
            <span className="text-lg font-semibold tracking-tight text-foreground">
              食育绘本
            </span>
          </div>

          <h1 className="mb-2 text-2xl font-semibold tracking-tight text-foreground">
            欢迎回来
          </h1>
          <p className="mb-8 text-sm text-muted">
            登录你的账号以继续
          </p>

          <form onSubmit={onSubmit} className="space-y-5">
            <label className="block">
              <div className="mb-1.5 text-xs font-medium text-muted">用户ID</div>
              <input
                value={userID}
                onChange={(e) => setUserID(e.target.value)}
                autoComplete="username"
                placeholder="请输入用户ID"
                className="form-input w-full"
              />
            </label>

            <label className="block">
              <div className="mb-1.5 text-xs font-medium text-muted">密码</div>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                autoComplete="current-password"
                placeholder="请输入密码"
                className="form-input w-full"
              />
            </label>

            {error ? (
              <div className="rounded-xl border border-error/20 bg-error-light px-4 py-3 text-sm text-error">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={loading || !userID || !password}
              className="inline-flex w-full items-center justify-center gap-2
                         rounded-xl border border-foreground bg-foreground py-3
                         text-sm font-semibold text-surface
                         transition-all duration-200 hover:opacity-90 active:scale-[0.98]
                         disabled:cursor-not-allowed disabled:border-muted disabled:bg-muted"
            >
              <SignIn size={18} weight="bold" />
              {loading ? '登录中...' : '登录'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => navigate('/noa/admin/users')}
            className="mt-6 w-full text-center text-xs text-muted/60
                       transition-colors hover:text-accent"
          >
            管理员入口
          </button>
        </div>
      </div>
    </div>
  )
}
