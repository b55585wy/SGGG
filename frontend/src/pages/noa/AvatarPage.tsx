import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getJson, postJson } from '@/lib/ncApi'

type Option = {
  id: string
  label: string
  image: string
}

type OptionsResponse = {
  hair: Option[]
  glasses: Option[]
  topColors: Option[]
  bottomColors: Option[]
}

type BaseResponse = {
  image: string
}

type ComponentResponse = {
  image: string
}

export default function AvatarPage() {
  const navigate = useNavigate()
  const [, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [baseImage, setBaseImage] = useState('')
  const [options, setOptions] = useState<OptionsResponse | null>(null)

  const [nickname, setNickname] = useState('')
  const [gender, setGender] = useState<'male' | 'female' | ''>('')

  const [hairId, setHairId] = useState('')
  const [glassesId, setGlassesId] = useState('')
  const [topId, setTopId] = useState('')
  const [bottomId, setBottomId] = useState('')

  const [hairImage, setHairImage] = useState('')
  const [glassesImage, setGlassesImage] = useState('')
  const [topImage, setTopImage] = useState('')
  const [bottomImage, setBottomImage] = useState('')

  const canSubmit = useMemo(
    () => !!nickname.trim() && !!gender && !saving,
    [nickname, gender, saving],
  )

  useEffect(() => {
    async function load() {
      setError('')
      setLoading(true)
      try {
        const [base, opts] = await Promise.all([
          getJson<BaseResponse>('/api/avatar/base'),
          getJson<OptionsResponse>('/api/avatar/options'),
        ])
        setBaseImage(base.image)
        setOptions(opts)

        const defaultHair = opts.hair[0]?.id || ''
        const defaultGlasses =
          opts.glasses.find((g) => g.id === 'none')?.id || opts.glasses[0]?.id || ''
        const defaultTop = opts.topColors[0]?.id || ''
        const defaultBottom = opts.bottomColors[0]?.id || ''

        setHairId(defaultHair)
        setGlassesId(defaultGlasses)
        setTopId(defaultTop)
        setBottomId(defaultBottom)

        const [hairRes, glassesRes, topRes, bottomRes] = await Promise.all([
          defaultHair ? fetchComponent('hair', defaultHair) : Promise.resolve(''),
          defaultGlasses ? fetchComponent('glasses', defaultGlasses) : Promise.resolve(''),
          defaultTop ? fetchComponent('top', defaultTop) : Promise.resolve(''),
          defaultBottom ? fetchComponent('bottom', defaultBottom) : Promise.resolve(''),
        ])
        setHairImage(hairRes)
        setGlassesImage(glassesRes)
        setTopImage(topRes)
        setBottomImage(bottomRes)
      } catch (e) {
        setError(e instanceof Error ? e.message : '加载失败')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  async function fetchComponent(
    type: 'hair' | 'glasses' | 'top' | 'bottom',
    id: string,
  ) {
    const data = await getJson<ComponentResponse>(
      `/api/avatar/component?type=${type}&id=${id}`,
    )
    return data.image
  }

  async function onSelectHair(id: string) {
    setHairId(id)
    try {
      const image = await fetchComponent('hair', id)
      setHairImage(image)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    }
  }

  async function onSelectGlasses(id: string) {
    setGlassesId(id)
    try {
      const image = await fetchComponent('glasses', id)
      setGlassesImage(image)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    }
  }

  async function onSelectTop(id: string) {
    setTopId(id)
    try {
      const image = await fetchComponent('top', id)
      setTopImage(image)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    }
  }

  async function onSelectBottom(id: string) {
    setBottomId(id)
    try {
      const image = await fetchComponent('bottom', id)
      setBottomImage(image)
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败')
    }
  }

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
        hairStyle: hairId,
        glasses: glassesId,
        topColor: topId,
        bottomColor: bottomId,
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
    <div style={{ padding: 24, width: '100%', boxSizing: 'border-box' }}>
      <div style={{ marginBottom: 16, textAlign: 'left' }}>
        <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>
          来一起创造你在故事世界的形象吧！
        </div>
        <div style={{ color: '#6b7280', fontSize: 13 }}>
          请先完成昵称与性别，再选择形象组件
        </div>
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
          <div style={{ fontSize: 14, color: '#111827', marginBottom: 12 }}>
            预览
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
            {baseImage ? (
              <img
                src={baseImage}
                alt="base"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              />
            ) : null}
            {topImage ? (
              <img
                src={topImage}
                alt="top"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              />
            ) : null}
            {bottomImage ? (
              <img
                src={bottomImage}
                alt="bottom"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              />
            ) : null}
            {hairImage ? (
              <img
                src={hairImage}
                alt="hair"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              />
            ) : null}
            {glassesImage ? (
              <img
                src={glassesImage}
                alt="glasses"
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              />
            ) : null}
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          style={{
            border: '1px solid #e5e7eb',
            borderRadius: 16,
            padding: 20,
            background: '#fff',
            textAlign: 'left',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 12 }}>基本信息</div>

          <label style={{ display: 'block', marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: '#374151', marginBottom: 6 }}>
              昵称
            </div>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 8,
              }}
            />
          </label>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#374151', marginBottom: 6 }}>性别</div>
            <div style={{ display: 'flex', gap: 12 }}>
              {[
                { value: 'male', label: '男' },
                { value: 'female', label: '女' },
              ].map((item) => (
                <label
                  key={item.value}
                  onClick={() => setGender(item.value as 'male' | 'female')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 10px',
                    border: '1px solid #d1d5db',
                    borderRadius: 999,
                    cursor: 'pointer',
                    background: gender === item.value ? '#111827' : '#fff',
                    color: gender === item.value ? '#fff' : '#111827',
                  }}
                >
                  <input
                    type="radio"
                    name="gender"
                    value={item.value}
                    checked={gender === item.value}
                    onChange={() => setGender(item.value as 'male' | 'female')}
                    style={{ display: 'none' }}
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </div>

          <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 12 }}>形象选项</div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#374151', marginBottom: 6 }}>发型</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
              {(options?.hair || []).map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => onSelectHair(item.id)}
                  style={{
                    border: hairId === item.id ? '2px solid #111827' : '1px solid #d1d5db',
                    borderRadius: 12,
                    padding: 8,
                    background: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <img src={item.image} alt={item.label} style={{ width: '100%', height: 64 }} />
                  <div style={{ marginTop: 6, fontSize: 12 }}>{item.label}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#374151', marginBottom: 6 }}>眼镜</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
              {(options?.glasses || []).map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => onSelectGlasses(item.id)}
                  style={{
                    border: glassesId === item.id ? '2px solid #111827' : '1px solid #d1d5db',
                    borderRadius: 12,
                    padding: 8,
                    background: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <img src={item.image} alt={item.label} style={{ width: '100%', height: 64 }} />
                  <div style={{ marginTop: 6, fontSize: 12 }}>{item.label}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#374151', marginBottom: 6 }}>上衣颜色</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
              {(options?.topColors || []).map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => onSelectTop(item.id)}
                  style={{
                    border: topId === item.id ? '2px solid #111827' : '1px solid #d1d5db',
                    borderRadius: 12,
                    padding: 8,
                    background: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <img src={item.image} alt={item.label} style={{ width: '100%', height: 64 }} />
                  <div style={{ marginTop: 6, fontSize: 12 }}>{item.label}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#374151', marginBottom: 6 }}>下装颜色</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
              {(options?.bottomColors || []).map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => onSelectBottom(item.id)}
                  style={{
                    border: bottomId === item.id ? '2px solid #111827' : '1px solid #d1d5db',
                    borderRadius: 12,
                    padding: 8,
                    background: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <img src={item.image} alt={item.label} style={{ width: '100%', height: 64 }} />
                  <div style={{ marginTop: 6, fontSize: 12 }}>{item.label}</div>
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <div style={{ marginBottom: 12, color: '#b91c1c', fontSize: 13 }}>
              {error}
            </div>
          ) : null}

          <button
            type="submit"
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
            {saving ? '提交中...' : '提交并进入主页面'}
          </button>
        </form>
      </div>
    </div>
  )
}
