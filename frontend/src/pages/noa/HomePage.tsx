import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { clearToken } from '@/lib/auth'
import { getJson, postJson } from '@/lib/ncApi'
import {
  ClockCounterClockwise,
  Microphone,
  PaperPlaneTilt,
  BookOpenText,
  ArrowsClockwise,
  CheckCircle,
  SignOut,
  PencilSimple,
  SmileyWink,
  Sparkle,
} from '@phosphor-icons/react'

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
  expression: string
  score: number
}

type VoiceResponse = {
  text: string
}

/** Score → color for range thumb and accent */
function scoreColor(s: number): string {
  if (s <= 3) return '#e11d48'
  if (s <= 6) return '#f59e0b'
  return '#059669'
}

function scoreLabel(s: number): string {
  if (s <= 2) return '完全拒绝'
  if (s <= 4) return '不太喜欢'
  if (s <= 6) return '还行'
  if (s <= 8) return '比较喜欢'
  return '非常喜欢'
}

function LoadingSkeleton() {
  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto max-w-[1200px] px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-48 rounded-lg skeleton-shimmer" />
            <div className="h-4 w-32 rounded-md skeleton-shimmer" />
          </div>
          <div className="flex gap-3">
            <div className="h-10 w-10 rounded-xl skeleton-shimmer" />
            <div className="h-10 w-28 rounded-xl skeleton-shimmer" />
          </div>
        </div>
        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-[7fr_5fr]">
          <div className="space-y-6">
            <div className="h-24 rounded-[2rem] skeleton-shimmer" />
            <div className="h-80 rounded-[2rem] skeleton-shimmer" />
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
  const [bookGenerating, setBookGenerating] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  // Silent refresh: update status without full-page skeleton
  const refreshStatus = useCallback(async () => {
    try {
      const data = await getJson<HomeStatusResponse>('/api/home/status')
      setStatus(data)
      return data
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    void loadStatus()
  }, [loadStatus])

  // Poll for book generation completion
  useEffect(() => {
    if (!bookGenerating) return
    pollRef.current = setInterval(async () => {
      const data = await refreshStatus()
      if (data?.book) {
        setBookGenerating(false)
      }
    }, 3000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [bookGenerating, refreshStatus])

  useEffect(() => {
    const lastPath = sessionStorage.getItem('lastPath')
    if (lastPath && lastPath !== '/noa/home') {
      sessionStorage.removeItem('homeFeedbackText')
      setFeedbackText('')
      return
    }
    const storedFeedback = sessionStorage.getItem('homeFeedbackText')
    if (storedFeedback) setFeedbackText(storedFeedback)
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
      setBookGenerating(true)
      void refreshStatus()
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

  function onLogout() {
    clearToken()
    navigate('/noa/login', { replace: true })
  }

  const avatar = status?.avatar
  const book = status?.book
  const regenerateReached = book ? book.regenerateCount >= 2 : false

  // Range slider progress percentage
  const sliderPct = (score / 10) * 100
  const thumbColor = score > 0 ? scoreColor(score) : undefined

  if (loading) {
    return <LoadingSkeleton />
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto max-w-[1200px] px-5 py-4">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold tracking-tight text-foreground">
                {avatar?.nickname ? `${avatar.nickname}，你好` : '主页面'}
              </h1>
              {status?.themeFood ? (
                <span className="inline-flex items-center gap-1 rounded-full
                               border border-accent/20 bg-accent-light/50 px-2.5 py-0.5
                               text-[11px] font-medium text-accent-hover">
                  <Sparkle size={10} weight="fill" />
                  今日挑战：{status.themeFood}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onLogout}
              className="flex h-9 w-9 items-center justify-center rounded-xl
                         border border-border-light bg-surface text-muted
                         transition-all duration-200 hover:border-border hover:text-foreground
                         active:scale-[0.97]"
              title="退出登录"
            >
              <SignOut size={16} weight="bold" />
            </button>
            <button
              onClick={() => navigate('/noa/books/history')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-border-light
                         bg-surface px-3 py-2 text-xs font-medium text-foreground
                         shadow-[0_1px_3px_rgba(0,0,0,0.04)]
                         transition-all duration-200 hover:border-border hover:shadow-sm active:scale-[0.97]"
            >
              <ClockCounterClockwise size={15} weight="bold" />
              历史绘本
            </button>
          </div>
        </div>

        {/* Feedback banner */}
        {feedbackText ? (
          <div className="animate-in mb-3 rounded-xl border border-accent/20 bg-accent-light/60 px-4 py-2.5">
            <p className="text-xs font-medium leading-relaxed text-accent-hover">
              {feedbackText}
            </p>
          </div>
        ) : null}

        {/* Main grid: Left = avatar + food log, Right = book */}
        <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-[7fr_5fr]">
          {/* Left column */}
          <div className="space-y-4">
            {/* Avatar strip */}
            <div className="overflow-hidden rounded-[2rem] border border-border-light bg-surface
                            shadow-[0_20px_40px_-15px_rgba(0,0,0,0.04)]">
              <div className="flex items-center gap-5 p-4">
                {/* Avatar thumbnail */}
                <div className={`relative h-20 w-20 shrink-0 overflow-hidden
                                rounded-2xl bg-gradient-to-b from-warm-100 to-warm-200/60
                                ${feedbackText ? 'avatar-glow' : ''}`}>
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

                {/* Avatar info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <SmileyWink size={14} weight="fill" className="shrink-0 text-accent" />
                    <span className="truncate text-sm font-semibold text-foreground">
                      {avatar?.nickname || '我的形象'}
                    </span>
                  </div>
                  {feedbackText ? (
                    <p className="mt-1.5 text-xs leading-relaxed text-accent-hover line-clamp-2">
                      {feedbackText}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted">心情平静</p>
                  )}
                </div>

                {/* Edit button */}
                <button
                  onClick={() => navigate('/noa/avatar')}
                  className="shrink-0 inline-flex items-center gap-1 rounded-xl
                             border border-border-light px-3 py-1.5
                             text-[11px] font-medium text-muted
                             transition-all duration-200 hover:border-border hover:text-foreground
                             active:scale-[0.97]"
                >
                  <PencilSimple size={11} weight="bold" />
                  编辑
                </button>
              </div>
            </div>

            {/* Food log card */}
            <div className="rounded-[2rem] border border-border-light bg-surface p-6
                            shadow-[0_20px_40px_-15px_rgba(0,0,0,0.04)]">
              <h2 className="mb-5 text-lg font-semibold tracking-tight text-foreground">
                进食情况录入
              </h2>

              {/* Score slider */}
              <div className="mb-6">
                <div className="mb-3 flex items-center justify-between">
                  <label className="text-sm text-muted">
                    请给本次尝试{status?.themeFood || '食物'}打分
                  </label>
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className="text-lg font-bold tabular-nums transition-colors duration-200"
                      style={{ color: score > 0 ? scoreColor(score) : 'var(--color-muted)' }}
                    >
                      {score}
                    </span>
                    <span className="text-xs font-normal text-muted">/ 10</span>
                  </div>
                </div>

                <div className="relative">
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
                    style={{
                      background: score > 0
                        ? `linear-gradient(to right, ${scoreColor(score)} 0%, ${scoreColor(score)} ${sliderPct}%, var(--color-warm-200) ${sliderPct}%, var(--color-warm-200) 100%)`
                        : undefined,
                      ['--range-thumb-color' as string]: thumbColor,
                    }}
                  />
                </div>

                <div className="mt-2 flex items-center justify-between">
                  {scoreTouched && score > 0 ? (
                    <>
                      <span className="text-[10px] text-muted">完全拒绝</span>
                      <span
                        className="animate-in rounded-full px-2.5 py-0.5 text-[10px] font-medium text-surface"
                        style={{ backgroundColor: scoreColor(score) }}
                      >
                        {scoreLabel(score)}
                      </span>
                      <span className="text-[10px] text-muted">非常喜欢</span>
                    </>
                  ) : (
                    <span className="mx-auto text-[10px] text-muted">请拖动滑条打分</span>
                  )}
                </div>
              </div>

              {/* Textarea + voice */}
              <div className="mb-5">
                <label className="mb-2 block text-sm text-muted">进食反馈</label>
                <div className="flex gap-2">
                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    rows={3}
                    placeholder="描述一下进食过程..."
                    className="form-input flex-1 resize-none"
                  />
                  <button
                    type="button"
                    onClick={onTranscribe}
                    disabled={voiceLoading}
                    className="flex h-11 w-11 shrink-0 items-center justify-center self-center
                               rounded-xl border border-border-light bg-surface text-foreground
                               transition-all duration-200 hover:border-accent hover:text-accent
                               active:scale-[0.95] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Microphone size={20} weight={voiceLoading ? 'fill' : 'regular'} />
                  </button>
                </div>
              </div>

              {error ? (
                <div className="mb-4 rounded-xl border border-error/20 bg-error-light px-4 py-3 text-sm text-error">
                  {error}
                </div>
              ) : null}

              <button
                onClick={onSend}
                disabled={!canSend}
                className={`inline-flex w-full items-center justify-center gap-2
                           rounded-xl py-3 text-sm font-semibold
                           transition-all duration-200 active:scale-[0.98]
                           ${canSend
                             ? 'border border-foreground bg-foreground text-surface hover:opacity-90'
                             : 'cursor-not-allowed border border-warm-200 bg-warm-100 text-muted'
                           }`}
              >
                <PaperPlaneTilt size={18} weight="bold" />
                {sending ? '发送中...' : '发送'}
              </button>
            </div>
          </div>

          {/* Right: Book card (full height) */}
          <div className="flex flex-col overflow-hidden rounded-[2rem] border border-border-light bg-surface
                          shadow-[0_20px_40px_-15px_rgba(0,0,0,0.04)]">
            {bookGenerating && !book ? (
              /* Book generating skeleton */
              <div className="flex flex-1 flex-col">
                <div className="relative flex-1 min-h-[12rem] overflow-hidden
                              bg-gradient-to-br from-accent-light/30 via-warm-100 to-warm-200/40">
                  {/* Animated shimmer overlay */}
                  <div className="absolute inset-0 book-gen-shimmer" />
                  <div className="relative flex h-full flex-col items-center justify-center gap-4 p-6">
                    {/* Breathing book icon */}
                    <div className="book-gen-breathe flex h-16 w-16 items-center justify-center
                                    rounded-2xl bg-surface/90 shadow-sm
                                    border border-accent/10">
                      <BookOpenText size={32} weight="light" className="text-accent" />
                    </div>
                    <div className="space-y-2 text-center">
                      <p className="text-sm font-semibold text-foreground">
                        绘本生成中
                      </p>
                      <p className="text-xs text-muted leading-relaxed max-w-[18ch] mx-auto">
                        正在为你创作专属故事
                      </p>
                    </div>
                    {/* Progress dots */}
                    <div className="flex items-center gap-1.5">
                      <span className="book-gen-dot h-1.5 w-1.5 rounded-full bg-accent/60" style={{ animationDelay: '0ms' }} />
                      <span className="book-gen-dot h-1.5 w-1.5 rounded-full bg-accent/60" style={{ animationDelay: '200ms' }} />
                      <span className="book-gen-dot h-1.5 w-1.5 rounded-full bg-accent/60" style={{ animationDelay: '400ms' }} />
                    </div>
                  </div>
                </div>
                <div className="p-5">
                  <div className="mb-2 h-3 w-16 rounded skeleton-shimmer" />
                  <div className="mb-3 h-5 w-36 rounded skeleton-shimmer" />
                  <div className="space-y-1.5">
                    <div className="h-3.5 w-full rounded skeleton-shimmer" />
                    <div className="h-3.5 w-2/3 rounded skeleton-shimmer" />
                  </div>
                </div>
              </div>
            ) : (
              <>
                <button
                  onClick={() => book && navigate(`/noa/books/${book.bookID}`)}
                  className="flex flex-1 flex-col text-left transition-opacity duration-200 hover:opacity-80"
                  style={{ cursor: book ? 'pointer' : 'default' }}
                >
                  <div className="relative flex-1">
                    {book?.preview ? (
                      <div className="relative h-full min-h-[12rem] overflow-hidden bg-gradient-to-br from-accent-light/40 via-warm-100 to-warm-200/60">
                        <img
                          src={book.preview}
                          alt={book.title}
                          className="h-full w-full object-cover mix-blend-multiply"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-surface/80 to-transparent" />
                      </div>
                    ) : (
                      <div className="flex h-full min-h-[12rem] flex-col items-center justify-center
                                    bg-gradient-to-br from-accent-light/30 via-warm-100 to-warm-200/40">
                        <div className="mb-3 flex h-14 w-14 items-center justify-center
                                      rounded-2xl bg-surface/80 shadow-sm">
                          <BookOpenText size={28} weight="light" className="text-accent" />
                        </div>
                        <span className="text-xs font-medium text-muted">
                          提交进食记录后将生成绘本
                        </span>
                      </div>
                    )}
                    {book?.confirmed ? (
                      <span className="absolute bottom-3 right-3 inline-flex items-center gap-1
                                       rounded-full bg-accent px-3 py-1 text-xs font-medium text-surface
                                       shadow-sm">
                        <CheckCircle size={12} weight="fill" />
                        已确认
                      </span>
                    ) : null}
                  </div>
                  <div className="p-5">
                    <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted">
                      当前绘本
                    </div>
                    <h3 className="text-base font-semibold text-foreground">
                      {book?.title || '等待生成'}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">
                      {book?.description || '完成进食记录后，系统会为你生成专属绘本'}
                    </p>
                  </div>
                </button>

                {book && !book.confirmed ? (
                  <div className="space-y-3 px-5 pb-5">
                    <div className="flex gap-3">
                      <button
                        onClick={onConfirmBook}
                        className="flex-1 inline-flex items-center justify-center gap-1.5
                                   rounded-xl border border-accent bg-accent
                                   py-2.5 text-sm font-semibold text-surface
                                   shadow-[0_2px_8px_rgba(5,150,105,0.2)]
                                   transition-all duration-200 hover:bg-accent-hover active:scale-[0.98]"
                      >
                        <CheckCircle size={16} weight="bold" />
                        确认绘本
                      </button>
                      <button
                        onClick={() => navigate('/noa/books/create', { state: { fromRegenerate: true } })}
                        disabled={regenerateReached}
                        className="flex-1 inline-flex items-center justify-center gap-1.5
                                   rounded-xl border border-border bg-surface
                                   py-2.5 text-sm font-semibold text-foreground
                                   transition-all duration-200 hover:border-foreground active:scale-[0.98]
                                   disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ArrowsClockwise size={16} weight="bold" />
                        重新生成
                      </button>
                    </div>
                    {regenerateReached ? (
                      <p className="text-center text-xs text-error">
                        已达到重新生成上限，请确认当前绘本
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
