import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getJson, postJson } from '@/lib/ncApi'

type HomeStatusResponse = {
  book: {
    bookID: string
    title: string
    preview: string
    description: string
    confirmed: boolean
    regenerateCount: number
  }
}

export default function BookCreatePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [storyType, setStoryType] = useState('interactive')
  const [difficulty, setDifficulty] = useState('medium')
  const [pages, setPages] = useState(6)
  const [interactionDensity, setInteractionDensity] = useState('medium')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [regenerateCount, setRegenerateCount] = useState(0)
  const [submitting, setSubmitting] = useState(false)

  const allowEntry =
    location.state &&
    typeof location.state === 'object' &&
    'fromRegenerate' in location.state &&
    (location.state as { fromRegenerate?: unknown }).fromRegenerate === true

  const loadStatus = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const data = await getJson<HomeStatusResponse>('/api/home/status')
      setRegenerateCount(data.book?.regenerateCount ?? 0)
      if (data.book?.confirmed) {
        navigate('/noa/home', { replace: true })
        return
      }
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
  }, [navigate])

  useEffect(() => {
    if (!allowEntry) {
      navigate('/noa/home', { replace: true })
      return
    }
    void loadStatus()
  }, [allowEntry, loadStatus, navigate])

  const reachedLimit = regenerateCount >= 2
  const canSubmit = useMemo(
    () => !loading && !submitting && !reachedLimit,
    [loading, submitting, reachedLimit],
  )

  async function onSubmit() {
    setError('')
    if (reachedLimit) {
      setError('已达到重新生成上限')
      return
    }
    setSubmitting(true)
    try {
      await postJson('/api/book/regenerate', {
        title: title.trim(),
        note: note.trim(),
        story_type: storyType,
        difficulty,
        pages,
        interaction_density: interactionDensity,
      })
      navigate('/noa/home', { replace: true })
    } catch (e) {
      const message =
        e &&
        typeof e === 'object' &&
        'message' in e &&
        typeof (e as { message?: unknown }).message === 'string'
          ? (e as { message: string }).message
          : '提交失败'
      setError(message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!allowEntry) return null

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>创建绘本</div>
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

      <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
        <div style={{ marginBottom: 12, fontWeight: 600 }}>重新生成提示</div>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#374151', marginBottom: 6 }}>标题建议</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="可选"
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 8,
            }}
          />
        </label>
        <label style={{ display: 'block', marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: '#374151', marginBottom: 6 }}>补充要求</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="可选"
            rows={3}
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 8,
              resize: 'none',
            }}
          />
        </label>

        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            style={{
              background: 'none',
              border: 'none',
              color: '#6b7280',
              fontSize: 13,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {showAdvanced ? '▼' : '▶'} 高级故事配置
          </button>

          {showAdvanced && (
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ display: 'block' }}>
                <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>故事类型</div>
                <select
                  value={storyType}
                  onChange={(e) => setStoryType(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8 }}
                >
                  <option value="interactive">互动冒险</option>
                  <option value="adventure">探险故事</option>
                  <option value="social">社交故事</option>
                  <option value="sensory">感官体验</option>
                </select>
              </label>
              <label style={{ display: 'block' }}>
                <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>难度</div>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8 }}
                >
                  <option value="easy">简单</option>
                  <option value="medium">中等</option>
                  <option value="hard">困难</option>
                </select>
              </label>
              <label style={{ display: 'block' }}>
                <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>页数: {pages}</div>
                <input
                  type="range"
                  min={4}
                  max={12}
                  value={pages}
                  onChange={(e) => setPages(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
              </label>
              <label style={{ display: 'block' }}>
                <div style={{ fontSize: 12, color: '#374151', marginBottom: 4 }}>交互密度</div>
                <select
                  value={interactionDensity}
                  onChange={(e) => setInteractionDensity(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8 }}
                >
                  <option value="low">低</option>
                  <option value="medium">中</option>
                  <option value="high">高</option>
                </select>
              </label>
            </div>
          )}
        </div>

        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid #111827',
            background: !canSubmit ? '#6b7280' : '#111827',
            color: '#fff',
            cursor: !canSubmit ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? '生成中...' : '提交并重新生成'}
        </button>
        <div style={{ marginTop: 8, fontSize: 12, color: '#6b7280' }}>
          已使用 {regenerateCount}/2 次重新生成
        </div>
      </div>
    </div>
  )
}
