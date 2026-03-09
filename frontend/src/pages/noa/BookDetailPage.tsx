import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getJson } from '@/lib/ncApi'
import { sessionStart, storyGet } from '@/lib/api'

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
  const [searchParams] = useSearchParams()
  const isExperiment = searchParams.get('experiment') === '1'
  const [error, setError] = useState('')
  const [blocking, setBlocking] = useState(false)
  const [pendingStoryId, setPendingStoryId] = useState<string | null>(null)
  const [pendingConfirmed, setPendingConfirmed] = useState(false)

  const startReading = useCallback(async (draft: { story_id: string }, confirmed: boolean, cancelled: { current: boolean }) => {
    const storyId: string = draft.story_id
    localStorage.setItem('storybook_draft', JSON.stringify(draft))
    localStorage.setItem('storybook_book_id', bookId!)
    if (isExperiment) {
      localStorage.setItem('storybook_source', 'experiment')
      const clientToken = crypto.randomUUID()
      const sessionRes = await sessionStart({
        story_id: storyId,
        client_session_token: clientToken,
      })
      if (cancelled.current) return
      localStorage.setItem(
        'storybook_session',
        JSON.stringify({
          story_id: storyId,
          session_id: sessionRes.session_id,
          client_session_token: clientToken,
          session_index: (sessionRes as { session_index?: number }).session_index ?? 0,
        }),
      )
    } else if (confirmed) {
      localStorage.removeItem('storybook_session')
      localStorage.setItem('storybook_source', 'review')
    } else {
      localStorage.removeItem('storybook_session')
      localStorage.setItem('storybook_source', 'preview')
    }
    navigate('/reader', { replace: true })
  }, [bookId, isExperiment, navigate])

  const init = useCallback(async (cancelled: { current: boolean }) => {
    try {
      const data = await getJson<BookDetailResponse>(`/api/books/${bookId}`)
      if (cancelled.current) return

      const draft = JSON.parse(data.book.content)
      const imagesReady = Array.isArray(draft.pages) && draft.pages.every((p: { image_url?: string }) => !!p.image_url)
      if (imagesReady) {
        await startReading(draft, data.book.confirmed, cancelled)
        return
      }

      try {
        const latest = await storyGet(draft.story_id)
        if (cancelled.current) return
        const ready = Array.isArray(latest.draft.pages) && latest.draft.pages.every((p: { image_url?: string }) => !!p.image_url)
        if (ready) {
          await startReading(latest.draft, data.book.confirmed, cancelled)
          return
        }
      } catch (e) {
        void e
      }

      localStorage.setItem('storybook_draft', JSON.stringify(draft))
      localStorage.setItem('storybook_book_id', bookId!)
      setPendingConfirmed(data.book.confirmed)
      setPendingStoryId(draft.story_id)
      setBlocking(true)
    } catch (e) {
      if (cancelled.current) return
      const message = e instanceof Error ? e.message : '加载失败'
      setError(message)
    }
  }, [bookId, startReading])

  useEffect(() => {
    if (!bookId) {
      navigate('/noa/home', { replace: true })
      return
    }

    const cancelled = { current: false }
    const timer = setTimeout(() => { void init(cancelled) }, 0)

    return () => { cancelled.current = true; clearTimeout(timer) }
  }, [bookId, navigate, init])

  useEffect(() => {
    if (!pendingStoryId) return
    let cancelled = false
    const timer = setInterval(async () => {
      try {
        const latest = await storyGet(pendingStoryId)
        const ready = Array.isArray(latest.draft.pages) && latest.draft.pages.every((p: { image_url?: string }) => !!p.image_url)
        if (ready) {
          clearInterval(timer)
          if (cancelled) return
          setBlocking(false)
          setPendingStoryId(null)
          await startReading(latest.draft, pendingConfirmed, { current: false })
        }
      } catch (e) {
        void e
      }
    }, 3000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [pendingStoryId, pendingConfirmed, startReading])

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
    <>
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
      {blocking && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(15,23,42,0.35)',
            backdropFilter: 'blur(6px)',
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: 'white',
              borderRadius: 20,
              padding: '20px 22px',
              width: 320,
              textAlign: 'center',
              boxShadow: '0 18px 40px -12px rgba(15,23,42,0.25)',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>插图生成中</div>
            <div style={{ fontSize: 13, color: '#64748b', marginTop: 6 }}>请稍候，完成后自动进入阅读</div>
            <button
              onClick={() => navigate('/noa/home')}
              style={{
                marginTop: 14,
                border: '1px solid #e2e8f0',
                padding: '6px 12px',
                borderRadius: 999,
                background: 'white',
                cursor: 'pointer',
                color: '#334155',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              返回首页
            </button>
          </div>
        </div>
      )}
    </>
  )
}
