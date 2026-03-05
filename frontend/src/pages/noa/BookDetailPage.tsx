import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getJson } from '@/lib/ncApi'
import { sessionStart } from '@/lib/api'

type BookDetailResponse = {
  book: {
    bookID: string
    title: string
    preview: string
    description: string
    content: string
    confirmed: boolean
  }
}

export default function BookDetailPage() {
  const navigate = useNavigate()
  const { bookId } = useParams()
  const [error, setError] = useState('')

  useEffect(() => {
    if (!bookId) {
      navigate('/noa/home', { replace: true })
      return
    }

    let cancelled = false

    async function init() {
      try {
        // 1. 从 user-api 获取绘本详情
        const data = await getJson<BookDetailResponse>(`/api/books/${bookId}`)
        if (cancelled) return

        // 2. 解析 content 中的 story draft JSON
        const draft = JSON.parse(data.book.content)
        const storyId: string = draft.story_id

        // 3. 存入 localStorage（Reader 从这里读取）
        localStorage.setItem('storybook_draft', JSON.stringify(draft))
        localStorage.setItem('storybook_book_id', bookId!)

        if (data.book.confirmed) {
          // 历史绘本：只读模式，不进入实验流程，清除任何残留 session
          localStorage.removeItem('storybook_session')
        } else {
          // 4. 未确认绘本：创建阅读 session（正式实验流程）
          const clientToken = crypto.randomUUID()
          const sessionRes = await sessionStart({
            story_id: storyId,
            client_session_token: clientToken,
          })
          if (cancelled) return

          // 5. 存入 session 数据（useSession 从这里恢复）
          localStorage.setItem(
            'storybook_session',
            JSON.stringify({
              story_id: storyId,
              session_id: sessionRes.session_id,
              client_session_token: clientToken,
              session_index: (sessionRes as { session_index?: number }).session_index ?? 0,
            }),
          )
        }

        // 6. 跳转 Reader
        navigate('/reader', { replace: true })
      } catch (e) {
        if (cancelled) return
        const message =
          e instanceof Error ? e.message : '加载失败'
        setError(message)
      }
    }

    void init()
    return () => { cancelled = true }
  }, [bookId, navigate])

  if (error) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ color: '#b91c1c', marginBottom: 12 }}>{error}</div>
        <button
          onClick={() => navigate('/noa/home')}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #111827',
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          返回首页
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            width: 32,
            height: 32,
            border: '3px solid #e5e7eb',
            borderTopColor: '#111827',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
            margin: '0 auto 12px',
          }}
        />
        <div style={{ fontSize: 14, color: '#6b7280' }}>正在准备阅读...</div>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
