import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getJson } from '@/lib/ncApi'

type BookDetail = {
  bookID: string
  title: string
  preview: string
  description: string
  content: string
  confirmed: boolean
}

type BookDetailResponse = {
  book: BookDetail
}

export default function BookDetailPage() {
  const navigate = useNavigate()
  const { bookId } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [book, setBook] = useState<BookDetail | null>(null)

  const loadBook = useCallback(async (id: string) => {
    setError('')
    setLoading(true)
    try {
      const data = await getJson<BookDetailResponse>(`/api/books/${id}`)
      setBook(data.book)
    } catch (e) {
      const message =
        e &&
        typeof e === 'object' &&
        'message' in e &&
        typeof (e as { message?: unknown }).message === 'string'
          ? (e as { message: string }).message
          : '加载失败'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!bookId) {
      navigate('/noa/home', { replace: true })
      return
    }
    void loadBook(bookId)
  }, [bookId, loadBook, navigate])

  const parsedContent = useMemo(() => {
    if (!book?.content) return null
    try {
      return JSON.parse(book.content) as { pages?: Array<{ text?: string }> }
    } catch {
      return null
    }
  }, [book?.content])

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>绘本阅读</div>
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
          返回
        </button>
      </div>

      {loading ? <div>加载中...</div> : null}
      {error ? (
        <div style={{ marginBottom: 12, color: '#b91c1c', fontSize: 12 }}>{error}</div>
      ) : null}

      {book ? (
        <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24 }}>
          <div>
            <img
              src={book.preview}
              alt={book.title}
              style={{ width: '100%', borderRadius: 12, border: '1px solid #e5e7eb' }}
            />
            <div style={{ marginTop: 12, fontWeight: 600 }}>{book.title}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>
              {book.description}
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>
              {book.confirmed ? '已确认绘本' : '未确认绘本'}
            </div>
          </div>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
            {parsedContent?.pages?.length ? (
              parsedContent.pages.map((page, index) => (
                <div key={index} style={{ marginBottom: 12, fontSize: 14 }}>
                  {page.text}
                </div>
              ))
            ) : (
              <div style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{book.content}</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
