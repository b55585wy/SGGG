import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { postJson } from '@/lib/ncApi'
import AvatarRenderer from '@/components/AvatarRenderer'
import {
  SKIN_COLORS,
  HAIR_COLORS,
  HAIR_STYLES_SHORT,
  HAIR_STYLES_LONG,
  EXPRESSIONS,
  type AvatarBase,
  type ExpressionKey,
} from '@/lib/avatarConfig'

export default function AvatarPage() {
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [nickname, setNickname] = useState('')
  const [gender, setGender] = useState<'male' | 'female' | ''>('')

  const [skinColor, setSkinColor] = useState('f2d3b1')
  const [hairStyle, setHairStyle] = useState('short01')
  const [hairColor, setHairColor] = useState('0e0e0e')
  const [previewExpr, setPreviewExpr] = useState<ExpressionKey>('happy')

  const canSubmit = useMemo(
    () => !!nickname.trim() && !!gender && !saving,
    [nickname, gender, saving],
  )

  const hairOptions = gender === 'female' ? HAIR_STYLES_LONG : HAIR_STYLES_SHORT

  // Reset hair when switching gender
  const onGenderChange = (g: 'male' | 'female') => {
    setGender(g)
    if (g === 'female' && hairStyle.startsWith('short')) {
      setHairStyle('long01')
    } else if (g === 'male' && hairStyle.startsWith('long')) {
      setHairStyle('short01')
    }
  }

  const avatarBase: AvatarBase = { skinColor, hair: hairStyle, hairColor }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!nickname.trim() || !gender) {
      setError('昵称和性别不能为空')
      return
    }
    setSaving(true)
    try {
      await postJson('/api/avatar/save', {
        nickname: nickname.trim(),
        gender,
        skinColor,
        hair: hairStyle,
        hairColor,
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
      setSaving(false)
    }
  }

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto max-w-[1200px] px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-foreground">
            来一起创造你在故事世界的形象吧！
          </h1>
          <p className="mt-1 text-sm text-muted">
            请先完成昵称与性别，再选择形象组件
          </p>
        </div>

        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-[5fr_7fr]">
          {/* Preview */}
          <div className="rounded-[2rem] border border-border-light bg-surface p-5
                          shadow-[0_20px_40px_-15px_rgba(0,0,0,0.04)] md:sticky md:top-8">
            <div className="mb-3 text-sm font-medium text-muted">预览</div>
            <div className="mx-auto w-full max-w-[280px] overflow-hidden rounded-2xl
                            border border-border-light bg-warm-100 p-4">
              <AvatarRenderer
                base={avatarBase}
                expression={previewExpr}
                className="h-auto w-full"
              />
            </div>
            {/* Expression preview buttons */}
            <div className="mt-4">
              <div className="mb-2 text-xs text-muted">表情预览</div>
              <div className="flex gap-2">
                {(Object.entries(EXPRESSIONS) as [ExpressionKey, typeof EXPRESSIONS[ExpressionKey]][]).map(
                  ([key, val]) => (
                    <button
                      type="button"
                      key={key}
                      onClick={() => setPreviewExpr(key)}
                      className={`flex-1 rounded-xl py-2 text-xs font-medium transition-all duration-200
                        ${previewExpr === key
                          ? 'border border-accent bg-accent-light text-accent'
                          : 'border border-border-light bg-surface text-muted hover:border-border'
                        }`}
                    >
                      {val.label}
                    </button>
                  ),
                )}
              </div>
            </div>
          </div>

          {/* Form */}
          <form
            onSubmit={onSubmit}
            className="rounded-[2rem] border border-border-light bg-surface p-6
                       shadow-[0_20px_40px_-15px_rgba(0,0,0,0.04)]"
          >
            <div className="mb-5 text-base font-semibold text-foreground">基本信息</div>

            <label className="mb-4 block">
              <div className="mb-1.5 text-xs text-muted">昵称</div>
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="form-input w-full"
              />
            </label>

            <div className="mb-5">
              <div className="mb-1.5 text-xs text-muted">性别</div>
              <div className="flex gap-3">
                {[
                  { value: 'male' as const, label: '男' },
                  { value: 'female' as const, label: '女' },
                ].map((item) => (
                  <label
                    key={item.value}
                    onClick={() => onGenderChange(item.value)}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border
                      px-4 py-1.5 text-sm font-medium transition-all duration-200
                      ${gender === item.value
                        ? 'border-foreground bg-foreground text-surface'
                        : 'border-border bg-surface text-foreground hover:border-foreground'
                      }`}
                  >
                    <input
                      type="radio"
                      name="gender"
                      value={item.value}
                      checked={gender === item.value}
                      onChange={() => onGenderChange(item.value)}
                      className="hidden"
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="mb-5 text-base font-semibold text-foreground">形象选项</div>

            {/* Skin color */}
            <div className="mb-5">
              <div className="mb-2 text-xs text-muted">肤色</div>
              <div className="flex gap-2">
                {SKIN_COLORS.map((s) => (
                  <button
                    type="button"
                    key={s.id}
                    onClick={() => setSkinColor(s.id)}
                    className={`flex h-10 w-10 items-center justify-center rounded-full border-2
                      transition-all duration-150
                      ${skinColor === s.id ? 'border-accent shadow-sm scale-110' : 'border-transparent hover:border-border'}`}
                    title={s.label}
                  >
                    <div
                      className="h-7 w-7 rounded-full"
                      style={{ backgroundColor: `#${s.id}` }}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Hair color */}
            <div className="mb-5">
              <div className="mb-2 text-xs text-muted">发色</div>
              <div className="flex flex-wrap gap-2">
                {HAIR_COLORS.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => setHairColor(c.id)}
                    className={`flex h-10 w-10 items-center justify-center rounded-full border-2
                      transition-all duration-150
                      ${hairColor === c.id ? 'border-accent shadow-sm scale-110' : 'border-transparent hover:border-border'}`}
                    title={c.label}
                  >
                    <div
                      className="h-7 w-7 rounded-full"
                      style={{ backgroundColor: `#${c.id}` }}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Hair style */}
            <div className="mb-5">
              <div className="mb-2 text-xs text-muted">
                发型 {gender === 'female' ? '(长发)' : '(短发)'}
              </div>
              <div className="grid grid-cols-5 gap-2">
                {hairOptions.map((h) => (
                  <button
                    type="button"
                    key={h.id}
                    onClick={() => setHairStyle(h.id)}
                    className={`overflow-hidden rounded-xl border-2 p-1.5 transition-all duration-150
                      ${hairStyle === h.id
                        ? 'border-accent bg-accent-light shadow-sm'
                        : 'border-transparent hover:border-border'
                      }`}
                  >
                    <div className="mx-auto w-12 h-12 rounded-lg bg-warm-100 overflow-hidden">
                      <AvatarRenderer
                        base={{ skinColor, hair: h.id, hairColor }}
                        expression="happy"
                        className="h-full w-full scale-[1.8] translate-y-[15%]"
                      />
                    </div>
                    <div className="mt-1 truncate text-center text-[10px] text-muted">
                      {h.label}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {error ? (
              <div className="mb-4 rounded-xl border border-error/20 bg-error-light px-4 py-3 text-sm text-error">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex w-full items-center justify-center gap-2
                         rounded-xl border border-foreground bg-foreground py-3
                         text-sm font-semibold text-surface
                         transition-all duration-200 hover:opacity-90 active:scale-[0.98]
                         disabled:cursor-not-allowed disabled:border-muted disabled:bg-muted"
            >
              {saving ? '提交中...' : '提交并进入主页面'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
