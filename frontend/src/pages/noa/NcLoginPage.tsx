import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { postJson } from '@/lib/ncApi'
import { setToken } from '@/lib/auth'

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
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <form
        onSubmit={onSubmit}
        style={{
          width: 360,
          maxWidth: '90vw',
          padding: 24,
          border: '1px solid #e5e7eb',
          borderRadius: 12,
        }}
      >
        <h1 style={{ margin: 0, marginBottom: 16, fontSize: 20 }}>登录</h1>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#374151', marginBottom: 6 }}>
            用户ID
          </div>
          <input
            value={userID}
            onChange={(e) => setUserID(e.target.value)}
            autoComplete="username"
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 8,
            }}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#374151', marginBottom: 6 }}>
            密码
          </div>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 8,
            }}
          />
        </label>

        {error ? (
          <div style={{ marginBottom: 12, color: '#b91c1c', fontSize: 13 }}>
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading || !userID || !password}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #111827',
            background: loading ? '#6b7280' : '#111827',
            color: '#fff',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? '登录中...' : '登录'}
        </button>

        <div style={{ marginTop: 12, fontSize: 12, color: '#6b7280' }}>
          默认测试账号：demo / demo123
        </div>
      </form>
    </div>
  )
}
