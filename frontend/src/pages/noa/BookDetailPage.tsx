import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getJson } from '@/lib/ncApi'
import { sessionStart } from '@/lib/api'
import { MealReminderModal } from '@/components/MealReminderModal'

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

type HomeStatusResponse = {
  themeFood?: string
  [key: string]: unknown
}

export default function BookDetailPage() {
  const navigate = useNavigate()
  const { bookId } = useParams()
  const [searchParams] = useSearchParams()
  const isExperiment = searchParams.get('experiment') === '1'
  const [error, setError] = useState('')
  const [showReminder, setShowReminder] = useState(false)
  const [themeFood, setThemeFood] = useState('')
  const [ready, setReady] = useState(false)

  const init = useCallback(async (cancelled: { current: boolean }) => {
    try {
      const data = await getJson<BookDetailResponse>(`/api/books/${bookId}`)
      if (cancelled.current) return

      const draft = JSON.parse(data.book.content)
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
      } else if (data.book.confirmed) {
        localStorage.removeItem('storybook_session')
        localStorage.setItem('storybook_source', 'review')
      } else {
        localStorage.removeItem('storybook_session')
        localStorage.setItem('storybook_source', 'preview')
      }

      navigate('/reader', { replace: true })
    } catch (e) {
      if (cancelled.current) return
      const message = e instanceof Error ? e.message : '加载失败'
      setError(message)
    }
  }, [bookId, isExperiment, navigate])

  useEffect(() => {
    if (!bookId) {
      navigate('/noa/home', { replace: true })
      return
    }

    const cancelled = { current: false }

    if (localStorage.getItem('pending_meal_reminder') === '1') {
      // Fetch themeFood then show reminder
      getJson<HomeStatusResponse>('/api/home/status')
        .then((data) => {
          if (cancelled.current) return
          setThemeFood(data.themeFood ?? '')
          setShowReminder(true)
          setReady(true)
        })
        .catch(() => {
          if (cancelled.current) return
          // Even if fetch fails, still show reminder without themeFood
          setShowReminder(true)
          setReady(true)
        })
    } else {
      setReady(true)
      void init(cancelled)
    }

    return () => { cancelled.current = true }
  }, [bookId, navigate, init])

  function onReminderDone() {
    setShowReminder(false)
    const cancelled = { current: false }
    void init(cancelled)
  }

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
      {showReminder && ready && (
        <MealReminderModal themeFood={themeFood} onDone={onReminderDone} />
      )}
      {!showReminder && (
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
      )}
    </>
  )
}
