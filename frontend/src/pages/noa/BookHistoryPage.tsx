import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, BookOpenText } from '@phosphor-icons/react'
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

const spring = { type: 'spring' as const, stiffness: 100, damping: 20 }
const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 14, scale: 0.96 },
  show: { opacity: 1, y: 0, scale: 1, transition: spring },
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
        e && typeof e === 'object' && 'message' in e &&
        typeof (e as { message?: unknown }).message === 'string'
          ? (e as { message: string }).message
          : '加载失败'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  function formatDate(iso: string) {
    const d = new Date(iso)
    return `${d.getMonth() + 1}月${d.getDate()}日`
  }

  return (
    <div
      className="h-[100dvh] overflow-hidden flex flex-col relative"
      style={{ background: 'linear-gradient(145deg, #ecfdf5 0%, #f8faf9 55%, #fafaf9 100%)' }}
    >
      {/* ── Decorative blobs ── */}
      <div
        className="absolute pointer-events-none"
        style={{
          top: -80, right: -80, width: 400, height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(5,150,105,0.06) 0%, transparent 70%)',
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          bottom: -120, left: '15%', width: 500, height: 500,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(5,150,105,0.03) 0%, transparent 70%)',
        }}
      />

      {/* ── Header ── */}
      <header
        className="relative z-10 shrink-0 h-14 flex items-center gap-3 px-6"
        style={{
          background: 'rgba(236,253,245,0.85)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(5,150,105,0.1)',
        }}
      >
        <button
          onClick={() => navigate('/noa/home')}
          className="flex items-center justify-center w-9 h-9 rounded-full border transition-all active:scale-[0.95]"
          style={{
            borderColor: 'var(--color-border-light)',
            background: 'white',
            color: 'var(--color-muted)',
          }}
        >
          <ArrowLeft size={16} weight="bold" />
        </button>
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
            style={{ background: 'var(--color-accent)' }}
          >
            <BookOpenText size={14} weight="bold" style={{ color: 'white' }} />
          </div>
          <span className="font-bold tracking-tight" style={{ color: 'var(--color-foreground)' }}>
            历史绘本
          </span>
        </div>
        {!loading && items.length > 0 && (
          <span
            className="ml-auto rounded-full px-3 py-1 text-[11px] font-bold"
            style={{ background: 'var(--color-accent-light)', color: 'var(--color-accent)' }}
          >
            共 {items.length} 本
          </span>
        )}
      </header>

      {/* ── Content ── */}
      <div className="relative z-10 flex-1 min-h-0 overflow-y-auto px-6 py-5">

        {/* Error */}
        {error && (
          <div
            className="mb-4 rounded-2xl px-4 py-3 text-sm"
            style={{ background: 'var(--color-error-light)', color: 'var(--color-error)' }}
          >
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="rounded-[2rem] overflow-hidden skeleton-shimmer" style={{ aspectRatio: '3/4' }} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && items.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={spring}
            className="flex flex-col items-center justify-center h-full gap-4 pb-16"
          >
            <div
              className="flex h-24 w-24 items-center justify-center rounded-[2rem]"
              style={{
                background: 'white',
                boxShadow: '0 8px 28px -8px rgba(0,0,0,0.06), 0 0 0 1px rgba(231,229,228,0.6)',
              }}
            >
              <BookOpenText size={40} weight="light" style={{ color: 'var(--color-accent)', opacity: 0.5 }} />
            </div>
            <div className="text-center space-y-1">
              <p className="text-base font-bold" style={{ color: 'var(--color-foreground)' }}>还没有绘本</p>
              <p className="text-sm" style={{ color: 'var(--color-muted)' }}>提交进食记录后会为你生成专属绘本</p>
            </div>
            <button
              onClick={() => navigate('/noa/home')}
              className="rounded-full px-6 py-2.5 text-sm font-bold text-white transition-all active:scale-[0.97]"
              style={{
                background: 'linear-gradient(135deg, #059669, #047857)',
                border: 'none',
                boxShadow: '0 8px 20px -4px rgba(5,150,105,0.35)',
                cursor: 'pointer',
              }}
            >
              去记录进食
            </button>
          </motion.div>
        )}

        {/* Book grid */}
        {!loading && items.length > 0 && (
          <motion.div
            className="grid grid-cols-4 gap-4"
            variants={containerVariants}
            initial="hidden"
            animate="show"
          >
            {items.map((item) => (
              <motion.button
                key={item.bookID}
                variants={itemVariants}
                onClick={() => navigate(`/noa/books/${item.bookID}`)}
                whileTap={{ scale: 0.97 }}
                className="relative overflow-hidden rounded-[2rem] text-left transition-all"
                style={{
                  background: 'white',
                  boxShadow: '0 8px 28px -8px rgba(0,0,0,0.07), 0 0 0 1px rgba(231,229,228,0.6)',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {/* Cover image */}
                <div className="relative overflow-hidden" style={{ aspectRatio: '3/4' }}>
                  {item.preview ? (
                    <img
                      src={item.preview}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center"
                      style={{ background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)' }}
                    >
                      <BookOpenText size={32} weight="light" style={{ color: 'var(--color-accent)', opacity: 0.5 }} />
                    </div>
                  )}
                  {/* Gradient overlay */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.45) 0%, transparent 55%)' }}
                  />
                  {/* Date badge */}
                  <span
                    className="absolute top-3 right-3 rounded-full px-2.5 py-1 text-[10px] font-bold"
                    style={{ background: 'rgba(255,255,255,0.9)', color: 'var(--color-muted)' }}
                  >
                    {formatDate(item.confirmedAt)}
                  </span>
                  {/* Title overlay at bottom of image */}
                  <div className="absolute bottom-0 inset-x-0 px-3 pb-3">
                    <p className="text-xs font-bold text-white line-clamp-2 leading-tight">
                      {item.title}
                    </p>
                  </div>
                </div>

                {/* Description */}
                <div className="px-3 py-3">
                  <p className="text-[11px] leading-relaxed line-clamp-2" style={{ color: 'var(--color-muted)' }}>
                    {item.description}
                  </p>
                </div>
              </motion.button>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  )
}
