import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getJson } from '@/lib/ncApi'

type HistoryItem = {
  bookID: string
  title: string
  preview: string
  description: string
  confirmedAt: string
}

type HistoryResponse = {
  items: HistoryItem[]
}

export default function BookHistoryPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [items, setItems] = useState<HistoryItem[]>([])

  useEffect(() => {
    void loadHistory()
  }, [])

  async function loadHistory() {
    setError('')
    setLoading(true)
    try {
      const data = await getJson<HistoryResponse>('/api/books/history')
      setItems(data.items || [])
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
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>历史绘本</div>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
        {items.length === 0 && !loading ? (
          <div style={{ color: '#6b7280', fontSize: 13 }}>暂无历史绘本</div>
        ) : null}
        {items.map((item) => (
          <button
            key={item.bookID}
            onClick={() => navigate(`/noa/books/${item.bookID}`)}
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: 12,
              background: '#fff',
              padding: 0,
              textAlign: 'left',
              overflow: 'hidden',
              cursor: 'pointer',
            }}
          >
            <img
              src={item.preview}
              alt={item.title}
              style={{ width: '100%', height: 180, objectFit: 'cover' }}
            />
            <div style={{ padding: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{item.title}</div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{item.description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
