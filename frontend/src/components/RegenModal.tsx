import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  X,
  ForkKnife,
  GameController,
  Compass,
  UsersThree,
  Palette,
} from '@phosphor-icons/react'

export const POST_COMPLETE_REGEN_PAYLOAD_KEY = 'pending_reader_regen_payload'

const STORY_TYPES = [
  { value: 'curious_discovery', label: '好奇发现', Icon: GameController },
  { value: 'everyday_routine',  label: '日常小事', Icon: Compass },
  { value: 'light_fantasy',     label: '轻趣幻想', Icon: UsersThree },
  { value: 'journey_discovery', label: '奇妙探索', Icon: Palette },
]

const spring = { type: 'spring' as const, stiffness: 120, damping: 22 }

type RegenModalProps = {
  themeFood: string
  currentStoryType?: string
  regenerateCount: number
  mode?: 'regenerate' | 'next_episode'
  onClose: () => void
  onSubmit: (payload: Record<string, unknown>) => void
}

export default function RegenModal({
  themeFood,
  currentStoryType,
  regenerateCount,
  mode = 'regenerate',
  onClose,
  onSubmit,
}: RegenModalProps) {
  const [foodOverride, setFoodOverride] = useState('')
  const [storyType, setStoryType] = useState(currentStoryType || 'light_fantasy')
  const [storyTypeTouched, setStoryTypeTouched] = useState(false)

  const isNextEpisodeMode = mode === 'next_episode'
  const reachedLimit = !isNextEpisodeMode && regenerateCount >= 2
  const canSubmit = !reachedLimit
  const currentStoryTypeLabel = useMemo(() => {
    const found = STORY_TYPES.find((item) => item.value === currentStoryType)
    if (found) return found.label
    return currentStoryType || '轻趣幻想'
  }, [currentStoryType])

  useEffect(() => {
    setStoryType(currentStoryType || 'light_fantasy')
    setStoryTypeTouched(false)
  }, [currentStoryType])

  function handleSubmit() {
    if (!canSubmit) return
    const trimmedFood = foodOverride.trim()
    const payload: Record<string, unknown> = {
      target_food: trimmedFood || undefined,
    }
    if (isNextEpisodeMode && trimmedFood) payload.persist_target_food = true
    if (storyTypeTouched) payload.story_type = storyType
    onSubmit(payload)
  }

  return (
    <>
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(6px)' }}
        onClick={onClose}
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none">
        <motion.div
          key="dialog"
          initial={{ opacity: 0, scale: 0.93, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.93, y: -10 }}
          transition={spring}
          className="pointer-events-auto flex flex-col w-full"
          style={{
            maxWidth: 520,
            maxHeight: '80dvh',
            background: 'white',
            borderRadius: '2rem',
            boxShadow: '0 32px 80px -12px rgba(0,0,0,0.18), 0 0 0 1px rgba(231,229,228,0.6)',
          }}
        >
          <div
            className="shrink-0 flex items-center justify-between px-6 pt-5 pb-4 border-b"
            style={{ borderColor: 'var(--color-border-light)' }}
          >
            <div>
              <h2 className="text-base font-bold tracking-tight" style={{ color: 'var(--color-foreground)' }}>
                {isNextEpisodeMode ? '下一集食物/风格选择' : '重新生成'}
              </h2>
              {!isNextEpisodeMode && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-muted)' }}>
                  已使用 <span className="font-mono font-semibold">{regenerateCount}</span>/2 次
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full transition-all active:scale-[0.93]"
              style={{
                background: 'var(--color-warm-100)',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-muted)',
              }}
            >
              <X size={15} weight="bold" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
            <section>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-xs font-mono font-semibold" style={{ color: 'var(--color-accent)' }}>01</span>
                <span className="text-sm font-bold tracking-tight" style={{ color: 'var(--color-foreground)' }}>故事类型</span>
                <span className="text-xs ml-auto px-2 py-0.5 rounded-full font-mono" style={{ color: 'var(--color-muted)', background: 'var(--color-warm-100)', border: '1px solid var(--color-border-light)' }}>
                  当前 {currentStoryTypeLabel}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {STORY_TYPES.map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => { setStoryType(value); setStoryTypeTouched(true) }}
                    className="flex items-center gap-2 py-2.5 px-3 rounded-2xl text-sm font-medium border transition-colors text-left"
                    style={
                      storyType === value
                        ? { borderColor: 'var(--color-accent)', background: 'var(--color-accent-light)', color: 'var(--color-accent)' }
                        : { borderColor: 'var(--color-border-light)', background: '#fafaf9', color: 'var(--color-foreground)' }
                    }
                  >
                    <Icon size={14} weight="duotone" />
                    {label}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-xs font-mono font-semibold" style={{ color: 'var(--color-accent)' }}>02</span>
                <span className="text-sm font-bold tracking-tight" style={{ color: 'var(--color-foreground)' }}>
                  {isNextEpisodeMode ? '下集食物（会更新默认）' : '临时换个食物'}
                </span>
                {themeFood && (
                  <span className="text-xs ml-auto px-2 py-0.5 rounded-full font-mono" style={{ color: 'var(--color-muted)', background: 'var(--color-warm-100)', border: '1px solid var(--color-border-light)' }}>
                    当前 {themeFood}
                  </span>
                )}
              </div>
              <div className="relative">
                <ForkKnife size={14} weight="duotone" className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-muted)' }} />
                <input
                  value={foodOverride}
                  onChange={(e) => setFoodOverride(e.target.value)}
                  placeholder={
                    isNextEpisodeMode
                      ? (themeFood ? `换掉"${themeFood}"，并作为后续默认` : '输入下集食物（会更新默认）')
                      : (themeFood ? `换掉"${themeFood}"，仅此次生效` : '输入食物名称')
                  }
                  className="form-input"
                  style={{ paddingLeft: 32 }}
                />
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--color-muted)' }}>
                {isNextEpisodeMode
                  ? '填写后：本次下一集会用这个食物，且后续默认食物也会更新为它；不填写则保持当前默认。'
                  : '仅影响这一次重新生成，不会修改你的默认食物。'}
              </p>
            </section>
          </div>

          <div className="shrink-0 px-6 py-4 border-t" style={{ borderColor: 'var(--color-border-light)' }}>
            {reachedLimit ? (
              <div className="text-center text-sm py-3 rounded-2xl font-medium" style={{ color: 'var(--color-muted)', background: 'var(--color-warm-100)' }}>
                已达到重新生成上限（2/2）
              </div>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="w-full py-3.5 rounded-full font-bold text-sm text-white transition-all active:scale-[0.98]"
                style={{
                  background: canSubmit
                    ? 'linear-gradient(135deg, #059669, #047857)'
                    : 'var(--color-muted)',
                  cursor: canSubmit ? 'pointer' : 'not-allowed',
                  border: 'none',
                  boxShadow: canSubmit ? '0 8px 24px -4px rgba(5,150,105,0.38)' : 'none',
                }}
              >
                {isNextEpisodeMode ? '确认并生成下一集 →' : '提交并重新生成 →'}
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </>
  )
}
