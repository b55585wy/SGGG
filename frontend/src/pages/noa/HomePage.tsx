import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearToken } from '@/lib/auth'
import { getJson, postJson } from '@/lib/ncApi'
import { ClockCounterClockwise, Microphone, PaperPlaneTilt } from '@phosphor-icons/react'

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

function LoadingSkeleton() {
  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto max-w-[1200px] px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div className="h-7 w-20 rounded-lg skeleton-shimmer" />
          <div className="h-10 w-28 rounded-xl skeleton-shimmer" />
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[7fr_5fr]">
          <div className="space-y-6">
            <div className="h-80 rounded-[2rem] skeleton-shimmer" />
            <div className="h-72 rounded-[2rem] skeleton-shimmer" />
          </div>
          <div className="h-[28rem] rounded-[2rem] skeleton-shimmer" />
        </div>
      </div>
    </div>
  )
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
    return <LoadingSkeleton />
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto max-w-[1200px] px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            主页面
          </h1>
          <button
            onClick={() => navigate('/noa/books/history')}
            className="inline-flex items-center gap-2 rounded-xl border border-border-light
                       bg-surface px-4 py-2.5 text-sm font-medium text-foreground
                       shadow-[0_1px_3px_rgba(0,0,0,0.04)]
                       transition-all duration-200 hover:border-border hover:shadow-sm active:scale-[0.97]"
          >
            <ClockCounterClockwise size={18} weight="bold" />
            历史绘本
          </button>
        </div>

        {/* Feedback banner */}
        {feedbackText ? (
          <div className="animate-in mb-6 rounded-2xl border border-accent/20 bg-accent-light/60 px-5 py-4">
            <p className="text-sm font-medium leading-relaxed text-accent-hover">
              {feedbackText}
            </p>
          </div>
        ) : null}

        {/* Main grid: avatar narrow left, food+book stacked right */}
        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-[5fr_7fr]">
          {/* Left: Avatar card — spans both rows on desktop */}
          <div className="rounded-[2rem] border border-border-light bg-surface p-5
                          shadow-[0_20px_40px_-15px_rgba(0,0,0,0.04)] md:row-span-2">
            {!feedbackText ? (
              <p className="mb-3 text-xs text-muted">正反馈语展示区域</p>
            ) : null}
            <div className="relative mx-auto aspect-[3/4] w-full overflow-hidden
                            rounded-2xl border border-border-light bg-warm-100">
              {avatar?.baseImage ? (
                <img src={avatar.baseImage} alt="base"
                     className="absolute inset-0 h-full w-full" />
              ) : null}
              {avatar?.topImage ? (
                <img src={avatar.topImage} alt="top"
                     className="absolute inset-0 h-full w-full" />
              ) : null}
              {avatar?.bottomImage ? (
                <img src={avatar.bottomImage} alt="bottom"
                     className="absolute inset-0 h-full w-full" />
              ) : null}
              {avatar?.hairImage ? (
                <img src={avatar.hairImage} alt="hair"
                     className="absolute inset-0 h-full w-full" />
              ) : null}
              {avatar?.glassesImage ? (
                <img src={avatar.glassesImage} alt="glasses"
                     className="absolute inset-0 h-full w-full" />
              ) : null}
            </div>
          </div>

          {/* Right top: Food log card */}
          <div className="rounded-[2rem] border border-border-light bg-surface p-6
                          shadow-[0_20px_40px_-15px_rgba(0,0,0,0.04)]">
              <h2 className="mb-5 text-lg font-semibold tracking-tight text-foreground">
                进食情况录入
              </h2>

              {/* Score slider */}
              <div className="mb-5">
                <div className="mb-3 flex items-center justify-between">
                  <label className="text-sm text-muted">
                    请给本次尝试{status?.themeFood || '食物'}打分
                  </label>
                  <span className="text-sm font-semibold tabular-nums text-foreground">
                    当前评分：{score}
                  </span>
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
                  className="range-accent w-full"
                />
              </div>

              {/* Feedback textarea */}
              <div className="mb-5">
                <label className="mb-2 block text-sm text-muted">进食反馈</label>
                <div className="flex gap-2">
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={3}
                    className="form-input flex-1 resize-none"
                  />
                  <button
                    type="button"
                    onClick={onTranscribe}
                    disabled={voiceLoading}
                    className="flex h-11 w-11 shrink-0 items-center justify-center self-start
                               rounded-xl border border-border-light bg-surface text-foreground
                               transition-all duration-200 hover:border-accent hover:text-accent
                               active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Microphone size={20} weight={voiceLoading ? 'fill' : 'regular'} />
                  </button>
                </div>
              </div>

              {/* Error */}
              {error ? (
                <p className="mb-4 text-sm text-error">{error}</p>
              ) : null}

              {/* Send button */}
              <button
                onClick={onSend}
                disabled={!canSend}
                className="inline-flex w-full items-center justify-center gap-2
                           rounded-xl border border-foreground bg-foreground py-3
                           text-sm font-semibold text-surface
                           transition-all duration-200 hover:opacity-90 active:scale-[0.98]
                           disabled:cursor-not-allowed disabled:border-muted disabled:bg-muted"
              >
                <PaperPlaneTilt size={18} weight="bold" />
                {sending ? '发送中...' : '发送'}
              </button>
            </div>
          </div>

          {/* Right: Book card */}
          <div className="overflow-hidden rounded-[2rem] border border-border-light bg-surface
                          shadow-[0_20px_40px_-15px_rgba(0,0,0,0.04)]">
            <button
              onClick={() => book && navigate(`/noa/books/${book.bookID}`)}
              className="w-full text-left transition-opacity duration-200 hover:opacity-80"
              style={{ cursor: book ? 'pointer' : 'default' }}
            >
              <div className="relative">
                {book?.preview ? (
                  <img
                    src={book.preview}
                    alt={book.title}
                    className="h-56 w-full object-cover"
                  />
                ) : (
                  <div className="h-56 bg-warm-100" />
                )}
                {book?.confirmed ? (
                  <span className="absolute bottom-3 right-3 inline-flex items-center gap-1
                                   rounded-full bg-accent px-3 py-1 text-xs font-medium text-surface">
                    已确认
                  </span>
                ) : null}
              </div>
              <div className="p-5">
                <h3 className="font-semibold text-foreground">
                  {book?.title || '绘本封面'}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  {book?.description || '暂无简介'}
                </p>
              </div>
            </button>

            {!book?.confirmed ? (
              <div className="space-y-3 px-5 pb-5">
                <div className="flex gap-3">
                  <button
                    onClick={onConfirmBook}
                    className="flex-1 rounded-xl border border-foreground bg-foreground
                               py-2.5 text-sm font-semibold text-surface
                               transition-all duration-200 hover:opacity-90 active:scale-[0.98]"
                  >
                    确认
                  </button>
                  <button
                    onClick={() => navigate('/noa/books/create', { state: { fromRegenerate: true } })}
                    disabled={regenerateReached}
                    className="flex-1 rounded-xl border border-border bg-surface
                               py-2.5 text-sm font-semibold text-foreground
                               transition-all duration-200 hover:border-foreground active:scale-[0.98]
                               disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    我要重新生成
                  </button>
                </div>
                {regenerateReached ? (
                  <p className="text-xs text-error">
                    已达到重新生成上限，请确认当前绘本
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
