import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearToken } from '@/lib/auth'
import { getJson, postJson } from '@/lib/ncApi'

type HomeStatusResponse = {
  avatar: {
    nickname: string
    baseImage: string | null
    hairImage: string
    glassesImage: string
    topImage: string
    bottomImage: string
  }
  feedbackText: string
  themeFood: string
  book: {
    bookID: string
    title: string
    preview: string
    description: string
    confirmed: boolean
    regenerateCount: number
  }
}

type FoodLogResponse = {
  ok: boolean
  feedbackText: string
}

type VoiceResponse = {
  text: string
}

export default function HomePage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<HomeStatusResponse | null>(null)
  const [feedbackText, setFeedbackText] = useState('')

  const [score, setScore] = useState(0)
  const [scoreTouched, setScoreTouched] = useState(false)
  const [content, setContent] = useState('')
  const [sending, setSending] = useState(false)
  const [voiceLoading, setVoiceLoading] = useState(false)

  const canSend = useMemo(
    () => !!content.trim() && scoreTouched && score > 0 && !sending,
    [content, scoreTouched, score, sending],
  )

  const loadStatus = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const data = await getJson<HomeStatusResponse>('/api/home/status')
      setStatus(data)
    } catch (e) {
      if (e && typeof e === 'object' && 'status' in e) {
        const statusCode = (e as { status?: number }).status
        if (statusCode === 401) {
          clearToken()
          navigate('/noa/login', { replace: true })
          return
        }
      }
      const message =
        e &&
        typeof e === 'object' &&
        'message' in e &&
        typeof (e as { message?: unknown }).message === 'string'
          ? (e as { message: string }).message
          : '加载失败'
      if (message === '未找到虚拟形象') {
        navigate('/noa/avatar', { replace: true })
        return
      }
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [navigate])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  useEffect(() => {
    const lastPath = sessionStorage.getItem('lastPath')
    if (lastPath && lastPath !== '/noa/home') {
      sessionStorage.removeItem('homeFeedbackText')
      setFeedbackText('')
      return
    }
    const storedFeedback = sessionStorage.getItem('homeFeedbackText')
    if (storedFeedback) {
      setFeedbackText(storedFeedback)
    }
  }, [])

  async function onSend() {
    setError('')
    if (!scoreTouched || score <= 0) {
      setError('请先滑动评分条')
      return
    }
    if (!content.trim()) {
      setError('请输入进食记录')
      return
    }
    setSending(true)
    try {
      const data = await postJson<FoodLogResponse>('/api/food/log', {
        score,
        content: content.trim(),
      })
      setFeedbackText(data.feedbackText)
      sessionStorage.setItem('homeFeedbackText', data.feedbackText)
      setContent('')
      setScore(0)
      setScoreTouched(false)
      setTimeout(() => {
        void loadStatus()
      }, 300)
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
      setSending(false)
    }
  }

  async function onTranscribe() {
    setError('')
    setVoiceLoading(true)
    try {
      const data = await postJson<VoiceResponse>('/api/voice/transcribe', {})
      setContent(data.text)
    } catch (e) {
      const message =
        e &&
        typeof e === 'object' &&
        'message' in e &&
        typeof (e as { message?: unknown }).message === 'string'
          ? (e as { message: string }).message
          : '语音转写失败'
      setError(message)
    } finally {
      setVoiceLoading(false)
    }
  }

  async function onConfirmBook() {
    setError('')
    try {
      await postJson('/api/book/confirm', {})
      await loadStatus()
    } catch (e) {
      const message =
        e &&
        typeof e === 'object' &&
        'message' in e &&
        typeof (e as { message?: unknown }).message === 'string'
          ? (e as { message: string }).message
          : '确认失败'
      setError(message)
    }
  }

  const avatar = status?.avatar
  const book = status?.book
  const regenerateReached = book ? book.regenerateCount >= 2 : false

  if (loading) {
    return <div style={{ padding: 24 }}>加载中...</div>
  }

  return (
    <div style={{ padding: 24, width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 600 }}>主页面</div>
        <button
          onClick={() => navigate('/noa/books/history')}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #111827',
            background: '#fff',
            cursor: 'pointer',
          }}
        >
          历史绘本
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: 24,
          alignItems: 'start',
        }}
      >
        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: 16,
            padding: 16,
            background: '#fff',
          }}
        >
          <div style={{ height: 90, display: 'flex', alignItems: 'center' }}>
            {feedbackText ? (
              <div
                style={{
                  background: '#fef3c7',
                  borderRadius: 12,
                  padding: '10px 14px',
                  fontSize: 13,
                  color: '#92400e',
                  maxWidth: '100%',
                }}
              >
                {feedbackText}
              </div>
            ) : (
              <div style={{ color: '#9ca3af', fontSize: 12 }}>正反馈语展示区域</div>
            )}
          </div>

          <div
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '3 / 4',
              borderRadius: 12,
              overflow: 'hidden',
              background: '#f8fafc',
              border: '1px solid #e5e7eb',
            }}
          >
            {avatar?.baseImage ? (
              <img
                src={avatar.baseImage}
                alt="base"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              />
            ) : null}
            {avatar?.topImage ? (
              <img
                src={avatar.topImage}
                alt="top"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              />
            ) : null}
            {avatar?.bottomImage ? (
              <img
                src={avatar.bottomImage}
                alt="bottom"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              />
            ) : null}
            {avatar?.hairImage ? (
              <img
                src={avatar.hairImage}
                alt="hair"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              />
            ) : null}
            {avatar?.glassesImage ? (
              <img
                src={avatar.glassesImage}
                alt="glasses"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              />
            ) : null}
          </div>

          <div style={{ marginTop: 16 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>进食情况录入</div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: '#374151', marginBottom: 6 }}>
                请给本次尝试{status?.themeFood || '食物'}打分
              </div>
              <input
                type="range"
                min={0}
                max={10}
                value={score}
                onChange={(e) => {
                  setScore(Number(e.target.value))
                  setScoreTouched(true)
                }}
                style={{ width: '100%' }}
              />
              <div style={{ textAlign: 'right', fontSize: 12, color: '#6b7280' }}>
                当前评分：{score}
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: '#374151', marginBottom: 6 }}>
                进食反馈
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={3}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #d1d5db',
                    resize: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={onTranscribe}
                  disabled={voiceLoading}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid #111827',
                    background: voiceLoading ? '#6b7280' : '#fff',
                    color: voiceLoading ? '#fff' : '#111827',
                    cursor: voiceLoading ? 'not-allowed' : 'pointer',
                    height: 42,
                    alignSelf: 'flex-start',
                  }}
                >
                  {voiceLoading ? '识别中' : '语音录入'}
                </button>
              </div>
            </div>

            {error ? (
              <div style={{ marginBottom: 12, color: '#b91c1c', fontSize: 12 }}>
                {error}
              </div>
            ) : null}

            <button
              onClick={onSend}
              disabled={!canSend}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid #111827',
                background: !canSend ? '#6b7280' : '#111827',
                color: '#fff',
                cursor: !canSend ? 'not-allowed' : 'pointer',
              }}
            >
              {sending ? '发送中...' : '发送'}
            </button>
          </div>
        </div>

        <div
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: 16,
            padding: 16,
            background: '#fff',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 12 }}>绘本封面</div>
          <button
            onClick={() => book && navigate(`/noa/books/${book.bookID}`)}
            style={{
              width: '100%',
              border: '1px solid #e5e7eb',
              borderRadius: 16,
              overflow: 'hidden',
              padding: 0,
              background: '#fff',
              cursor: book ? 'pointer' : 'default',
              textAlign: 'left',
            }}
          >
            <div style={{ position: 'relative' }}>
              {book?.preview ? (
                <img
                  src={book.preview}
                  alt={book.title}
                  style={{ width: '100%', height: 240, objectFit: 'cover' }}
                />
              ) : (
                <div style={{ height: 240, background: '#f3f4f6' }} />
              )}
              {book?.confirmed ? (
                <div
                  style={{
                    position: 'absolute',
                    right: 12,
                    bottom: 12,
                    background: '#22c55e',
                    color: '#fff',
                    borderRadius: 999,
                    padding: '4px 10px',
                    fontSize: 12,
                  }}
                >
                  已确认
                </div>
              ) : null}
            </div>
            <div style={{ padding: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 4 }}>
                {book?.title || '绘本封面'}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                {book?.description || '暂无简介'}
              </div>
            </div>
          </button>

          {!book?.confirmed ? (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 10 }}>确认绘本</div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={onConfirmBook}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid #111827',
                    background: '#111827',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  确认
                </button>
                <button
                  onClick={() => navigate('/noa/books/create', { state: { fromRegenerate: true } })}
                  disabled={regenerateReached}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid #111827',
                    background: regenerateReached ? '#6b7280' : '#fff',
                    color: regenerateReached ? '#fff' : '#111827',
                    cursor: regenerateReached ? 'not-allowed' : 'pointer',
                  }}
                >
                  我要重新生成
                </button>
              </div>
              {regenerateReached ? (
                <div style={{ marginTop: 8, fontSize: 12, color: '#b91c1c' }}>
                  已达到重新生成上限，请确认当前绘本
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
