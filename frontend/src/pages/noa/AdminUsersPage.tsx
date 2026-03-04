import { useEffect, useMemo, useState } from 'react'

type UserItem = {
  userID: string
  firstLogin: boolean
}

type UsersResponse = {
  users: UserItem[]
}

export default function AdminUsersPage() {
  const [adminKey, setAdminKey] = useState(
    () => sessionStorage.getItem('noa_child_admin_key') || '',
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [users, setUsers] = useState<UserItem[]>([])

  const canQuery = useMemo(() => adminKey.trim().length > 0, [adminKey])

  async function loadUsers() {
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/user/admin/users', {
        headers: {
          'x-admin-key': adminKey,
        },
      })
      const text = await res.text()
      const data = text ? (JSON.parse(text) as unknown) : null
      if (!res.ok) {
        const message =
          data &&
          typeof data === 'object' &&
          'message' in data &&
          typeof (data as { message?: unknown }).message === 'string'
            ? (data as { message: string }).message
            : '请求失败'
        throw new Error(message)
      }
      const body = data as UsersResponse
      setUsers(body.users || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    sessionStorage.setItem('noa_child_admin_key', adminKey)
  }, [adminKey])

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ margin: 0, marginBottom: 12, fontSize: 20 }}>用户列表</h1>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
        <label style={{ display: 'block', minWidth: 320 }}>
          <div style={{ fontSize: 12, color: '#374151', marginBottom: 6 }}>
            管理员密钥（x-admin-key）
          </div>
          <input
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 8,
            }}
          />
        </label>

        <button
          onClick={loadUsers}
          disabled={!canQuery || loading}
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid #111827',
            background: loading ? '#6b7280' : '#111827',
            color: '#fff',
            cursor: loading ? 'not-allowed' : 'pointer',
            height: 42,
          }}
        >
          {loading ? '加载中...' : '查询'}
        </button>
      </div>

      {error ? (
        <div style={{ marginTop: 12, color: '#b91c1c', fontSize: 13 }}>
          {error}
        </div>
      ) : null}

      <div style={{ marginTop: 16, border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              <th style={{ textAlign: 'left', padding: 12, fontSize: 12, color: '#374151' }}>
                userID
              </th>
              <th style={{ textAlign: 'left', padding: 12, fontSize: 12, color: '#374151' }}>
                firstLogin
              </th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={2} style={{ padding: 12, color: '#6b7280', fontSize: 13 }}>
                  暂无数据
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.userID} style={{ borderTop: '1px solid #e5e7eb' }}>
                  <td style={{ padding: 12, fontSize: 13 }}>{u.userID}</td>
                  <td style={{ padding: 12, fontSize: 13 }}>
                    {u.firstLogin ? 'true' : 'false'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
