import { useEffect, useMemo, useState } from 'react'
import {
  Trash,
  Plus,
  MagnifyingGlass,
  ChartBar,
  Users,
  BookOpenText,
  SortAscending,
  SortDescending,
  CaretDown,
  Warning,
} from '@phosphor-icons/react'

// ─── Types ──────────────────────────────────────────────────

type UserItem = { userID: string; firstLogin: boolean; themeFood: string }

type UserApiStats = {
  funnel: {
    totalUsers: number
    completedAvatar: number
    submittedFoodLog: number
    generatedBook: number
    confirmedBook: number
  }
  foodScores: {
    avgScore: number | null
    distribution: { low: number; mid: number; high: number }
  }
  books: {
    totalGenerated: number
    totalConfirmed: number
    avgRegenerateCount: number | null
  }
  enrichedUsers: Array<{
    userID: string
    themeFood: string
    firstLogin: boolean
    foodLogCount: number
    avgScore: number | null
    bookCount: number
    confirmedAt: string | null
    lastActive: string | null
  }>
}

type BackendStats = {
  sessions: {
    total: number
    completed: number
    aborted: number
    completedRate: number
    abortedRate: number
  }
  feedback: {
    tryLevelDist: Record<string, number>
    abortReasonDist: Record<string, number>
  }
  sus: {
    responseCount: number
    avgScore: number | null
    distribution: { low: number; mid: number; high: number }
  }
  completeness: {
    sessionsWithFeedback: number
    sessionsWithFeedbackPct: number
    sessionsWithSUS: number
    sessionsWithSUSPct: number
  }
}

// ─── Helpers ────────────────────────────────────────────────

const API_BASE = '/api/user'

function pct(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 1000) / 10 : 0
}

function relativeTime(iso: string | null): string {
  if (!iso) return '--'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return '刚刚'
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  return `${days}天前`
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '--'
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

type SortKey = 'userID' | 'themeFood' | 'foodLogCount' | 'avgScore' | 'bookCount' | 'confirmedAt' | 'lastActive'

// ─── Sub-components ─────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border-light bg-surface p-4
                    shadow-[0_8px_24px_-8px_rgba(0,0,0,0.04)]">
      <div className="text-[11px] font-medium text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-muted">{sub}</div> : null}
    </div>
  )
}

function FunnelBar({ label, count, total }: { label: string; count: number; total: number }) {
  const w = total > 0 ? Math.max((count / total) * 100, 2) : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-right text-[11px] text-muted">{label}</span>
      <div className="flex-1 h-5 rounded-lg bg-warm-100 overflow-hidden">
        <div
          className="h-full rounded-lg bg-accent transition-all duration-500"
          style={{ width: `${w}%` }}
        />
      </div>
      <span className="w-14 text-right text-xs font-semibold tabular-nums text-foreground">
        {count} <span className="text-[10px] font-normal text-muted">({pct(count, total)}%)</span>
      </span>
    </div>
  )
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const w = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="h-2 rounded-full bg-warm-100 overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${w}%`, backgroundColor: color }} />
    </div>
  )
}

function DistBadge({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: color + '18', color }}
    >
      {label}: {count}
    </span>
  )
}

// ─── Main ───────────────────────────────────────────────────

export default function AdminUsersPage() {
  const [adminKey, setAdminKey] = useState(
    () => sessionStorage.getItem('noa_child_admin_key') || '',
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // CRUD state
  const [users, setUsers] = useState<UserItem[]>([])
  const [newUserID, setNewUserID] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newThemeFood, setNewThemeFood] = useState('胡萝卜')
  const [creating, setCreating] = useState(false)

  // Stats state
  const [userStats, setUserStats] = useState<UserApiStats | null>(null)
  const [backendStats, setBackendStats] = useState<BackendStats | null>(null)
  const [backendError, setBackendError] = useState('')

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('userID')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const canQuery = useMemo(() => adminKey.trim().length > 0, [adminKey])
  const canCreate = useMemo(
    () => canQuery && newUserID.trim().length > 0 && newPassword.length > 0 && !creating,
    [canQuery, newUserID, newPassword, creating],
  )

  async function loadAll() {
    setError('')
    setBackendError('')
    setLoading(true)
    try {
      const headers = { 'x-admin-key': adminKey }
      const [statsRes, usersRes] = await Promise.all([
        fetch(`${API_BASE}/admin/stats`, { headers }).then(async (r) => {
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || '无权限')
          return r.json() as Promise<UserApiStats>
        }),
        fetch(`${API_BASE}/admin/users`, { headers }).then(async (r) => {
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message || '请求失败')
          return r.json() as Promise<{ users: UserItem[] }>
        }),
      ])
      setUserStats(statsRes)
      setUsers(usersRes.users || [])

      // Backend stats — optional, non-blocking
      try {
        const bRes = await fetch('/api/v1/admin/stats', { headers })
        if (bRes.ok) {
          setBackendStats(await bRes.json() as BackendStats)
        } else {
          setBackendError('后端数据不可用')
        }
      } catch {
        setBackendError('后端服务未连接')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败')
    } finally {
      setLoading(false)
    }
  }

  async function createUser() {
    setError('')
    setCreating(true)
    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({
          userID: newUserID.trim(),
          password: newPassword,
          themeFood: newThemeFood.trim() || '胡萝卜',
        }),
      })
      const data = (await res.json()) as { message?: string }
      if (!res.ok) throw new Error(data.message || '创建失败')
      setNewUserID('')
      setNewPassword('')
      setNewThemeFood('胡萝卜')
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : '创建失败')
    } finally {
      setCreating(false)
    }
  }

  async function removeUser(userID: string) {
    if (!confirm(`确定要删除用户 "${userID}" 吗？此操作不可撤销。`)) return
    setError('')
    try {
      const res = await fetch(`${API_BASE}/admin/users/${encodeURIComponent(userID)}`, {
        method: 'DELETE',
        headers: { 'x-admin-key': adminKey },
      })
      const data = (await res.json()) as { message?: string }
      if (!res.ok) throw new Error(data.message || '删除失败')
      await loadAll()
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败')
    }
  }

  useEffect(() => {
    sessionStorage.setItem('noa_child_admin_key', adminKey)
  }, [adminKey])

  // Sorted enriched users
  const sortedUsers = useMemo(() => {
    const list = [...(userStats?.enrichedUsers ?? [])]
    list.sort((a, b) => {
      let cmp = 0
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av == null && bv == null) cmp = 0
      else if (av == null) cmp = 1
      else if (bv == null) cmp = -1
      else if (typeof av === 'string') cmp = av.localeCompare(bv as string)
      else cmp = (av as number) - (bv as number)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [userStats, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('asc') }
  }

  const SortIcon = sortDir === 'asc' ? SortAscending : SortDescending
  function ColHeader({ label, sk }: { label: string; sk: SortKey }) {
    return (
      <th
        className="px-4 py-3 text-left text-[11px] font-medium text-muted cursor-pointer select-none
                   hover:text-foreground transition-colors"
        onClick={() => toggleSort(sk)}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {sortKey === sk ? <SortIcon size={12} weight="bold" /> : <CaretDown size={10} className="opacity-30" />}
        </span>
      </th>
    )
  }

  const funnel = userStats?.funnel
  const fs = userStats?.foodScores
  const bk = userStats?.books
  const sess = backendStats?.sessions
  const sus = backendStats?.sus
  const comp = backendStats?.completeness
  const fb = backendStats?.feedback

  return (
    <div className="min-h-[100dvh] bg-background">
      <div className="mx-auto max-w-[1100px] px-5 py-6">
        <h1 className="mb-5 text-xl font-semibold text-foreground">管理员后台</h1>

        {/* Admin key */}
        <div className="mb-5 flex items-end gap-3">
          <label className="flex-1">
            <div className="mb-1.5 text-xs text-muted">管理员密钥</div>
            <input
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              type="password"
              placeholder="请输入管理员密钥"
              className="form-input w-full"
            />
          </label>
          <button
            onClick={loadAll}
            disabled={!canQuery || loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-foreground bg-foreground
                       px-4 py-2.5 text-sm font-semibold text-surface
                       transition-all duration-200 hover:opacity-90 active:scale-[0.98]
                       disabled:cursor-not-allowed disabled:border-muted disabled:bg-muted"
          >
            <MagnifyingGlass size={16} weight="bold" />
            {loading ? '加载中...' : '加载数据'}
          </button>
        </div>

        {/* Error */}
        {error ? (
          <div className="mb-4 rounded-xl border border-error/20 bg-error/5 px-4 py-3 text-sm text-error">
            {error}
          </div>
        ) : null}

        {/* Stats dashboard — only shown after loading */}
        {userStats ? (
          <div className="space-y-5">
            {/* Overview cards */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="用户总数" value={funnel!.totalUsers} />
              <StatCard
                label="会话总数"
                value={sess?.total ?? '--'}
                sub={sess ? `完成 ${sess.completed} / 中止 ${sess.aborted}` : undefined}
              />
              <StatCard
                label="SUS 均分"
                value={sus?.avgScore ?? '--'}
                sub={sus?.responseCount ? `${sus.responseCount} 份问卷` : undefined}
              />
              <StatCard
                label="数据完整度"
                value={comp ? `${Math.round((comp.sessionsWithFeedbackPct + comp.sessionsWithSUSPct) / 2)}%` : '--'}
                sub={comp ? `反馈 ${comp.sessionsWithFeedbackPct}% / SUS ${comp.sessionsWithSUSPct}%` : undefined}
              />
            </div>

            {/* Engagement Funnel */}
            <div className="rounded-2xl border border-border-light bg-surface p-5
                            shadow-[0_8px_24px_-8px_rgba(0,0,0,0.04)]">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
                <Users size={16} weight="bold" className="text-accent" />
                参与度漏斗
              </h2>
              <div className="space-y-2">
                <FunnelBar label="注册用户" count={funnel!.totalUsers} total={funnel!.totalUsers} />
                <FunnelBar label="完成形象" count={funnel!.completedAvatar} total={funnel!.totalUsers} />
                <FunnelBar label="提交进食" count={funnel!.submittedFoodLog} total={funnel!.totalUsers} />
                <FunnelBar label="生成绘本" count={funnel!.generatedBook} total={funnel!.totalUsers} />
                <FunnelBar label="确认绘本" count={funnel!.confirmedBook} total={funnel!.totalUsers} />
              </div>
            </div>

            {/* Two columns: Food scores + Book metrics */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {/* Food Scores */}
              <div className="rounded-2xl border border-border-light bg-surface p-5
                              shadow-[0_8px_24px_-8px_rgba(0,0,0,0.04)]">
                <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <ChartBar size={16} weight="bold" className="text-accent" />
                  进食评分分布
                </h2>
                <div className="mb-3 text-center">
                  <span className="text-3xl font-bold tabular-nums text-foreground">
                    {fs!.avgScore ?? '--'}
                  </span>
                  <span className="ml-1 text-sm text-muted">/ 10 均分</span>
                </div>
                {(() => {
                  const total = fs!.distribution.low + fs!.distribution.mid + fs!.distribution.high
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted">拒绝 (0-3)</span>
                        <span className="font-medium text-foreground">{fs!.distribution.low}</span>
                      </div>
                      <ProgressBar value={fs!.distribution.low} max={total} color="#e11d48" />
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted">一般 (4-6)</span>
                        <span className="font-medium text-foreground">{fs!.distribution.mid}</span>
                      </div>
                      <ProgressBar value={fs!.distribution.mid} max={total} color="#f59e0b" />
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted">喜欢 (7-10)</span>
                        <span className="font-medium text-foreground">{fs!.distribution.high}</span>
                      </div>
                      <ProgressBar value={fs!.distribution.high} max={total} color="#059669" />
                    </div>
                  )
                })()}
              </div>

              {/* Book Metrics */}
              <div className="rounded-2xl border border-border-light bg-surface p-5
                              shadow-[0_8px_24px_-8px_rgba(0,0,0,0.04)]">
                <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <BookOpenText size={16} weight="bold" className="text-accent" />
                  绘本指标
                </h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">总生成数</span>
                    <span className="text-lg font-bold tabular-nums text-foreground">{bk!.totalGenerated}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">已确认数</span>
                    <span className="text-lg font-bold tabular-nums text-accent">{bk!.totalConfirmed}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">确认率</span>
                    <span className="text-lg font-bold tabular-nums text-foreground">
                      {bk!.totalGenerated > 0 ? pct(bk!.totalConfirmed, bk!.totalGenerated) : 0}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted">平均重新生成次数</span>
                    <span className="text-lg font-bold tabular-nums text-foreground">
                      {bk!.avgRegenerateCount ?? '--'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Backend stats: Sessions + Feedback */}
            {backendStats ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* Session Stats */}
                <div className="rounded-2xl border border-border-light bg-surface p-5
                                shadow-[0_8px_24px_-8px_rgba(0,0,0,0.04)]">
                  <h2 className="mb-4 text-sm font-semibold text-foreground">会话统计</h2>
                  <div className="space-y-3">
                    <div>
                      <div className="mb-1 flex justify-between text-[11px]">
                        <span className="text-muted">完成率</span>
                        <span className="font-medium text-accent">{sess!.completedRate}%</span>
                      </div>
                      <ProgressBar value={sess!.completed} max={sess!.total} color="#059669" />
                    </div>
                    <div>
                      <div className="mb-1 flex justify-between text-[11px]">
                        <span className="text-muted">中止率</span>
                        <span className="font-medium text-error">{sess!.abortedRate}%</span>
                      </div>
                      <ProgressBar value={sess!.aborted} max={sess!.total} color="#e11d48" />
                    </div>
                    <div className="pt-2 text-xs text-muted">
                      总计 {sess!.total} 个会话 · 完成 {sess!.completed} · 中止 {sess!.aborted}
                    </div>
                  </div>
                </div>

                {/* Feedback Distribution */}
                <div className="rounded-2xl border border-border-light bg-surface p-5
                                shadow-[0_8px_24px_-8px_rgba(0,0,0,0.04)]">
                  <h2 className="mb-4 text-sm font-semibold text-foreground">反馈分布</h2>
                  {Object.keys(fb!.tryLevelDist).length > 0 ? (
                    <div className="mb-3">
                      <div className="mb-2 text-[11px] text-muted">进食等级</div>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(fb!.tryLevelDist).map(([k, v]) => (
                          <DistBadge key={k} label={k} count={v} color="#059669" />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mb-3 text-[11px] text-muted">暂无进食等级数据</div>
                  )}
                  {Object.keys(fb!.abortReasonDist).length > 0 ? (
                    <div>
                      <div className="mb-2 text-[11px] text-muted">中止原因</div>
                      <div className="flex flex-wrap gap-1.5">
                        {Object.entries(fb!.abortReasonDist).map(([k, v]) => (
                          <DistBadge key={k} label={k} count={v} color="#e11d48" />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-muted">暂无中止原因数据</div>
                  )}
                </div>
              </div>
            ) : backendError ? (
              <div className="rounded-2xl border border-border-light bg-warm-100/50 p-4
                              flex items-center gap-2 text-xs text-muted">
                <Warning size={14} weight="bold" />
                {backendError}（会话/反馈/SUS 数据不可用）
              </div>
            ) : null}

            {/* SUS + Data Completeness */}
            {backendStats ? (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {/* SUS */}
                <div className="rounded-2xl border border-border-light bg-surface p-5
                                shadow-[0_8px_24px_-8px_rgba(0,0,0,0.04)]">
                  <h2 className="mb-3 text-sm font-semibold text-foreground">SUS 可用性评分</h2>
                  <div className="mb-3 text-center">
                    <span className="text-3xl font-bold tabular-nums text-foreground">
                      {sus!.avgScore ?? '--'}
                    </span>
                    <span className="ml-1 text-sm text-muted">/ 100</span>
                  </div>
                  {sus!.responseCount > 0 ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted">差 (&lt;50)</span>
                        <span className="font-medium">{sus!.distribution.low}</span>
                      </div>
                      <ProgressBar value={sus!.distribution.low} max={sus!.responseCount} color="#e11d48" />
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted">中 (50-70)</span>
                        <span className="font-medium">{sus!.distribution.mid}</span>
                      </div>
                      <ProgressBar value={sus!.distribution.mid} max={sus!.responseCount} color="#f59e0b" />
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted">好 (&ge;70)</span>
                        <span className="font-medium">{sus!.distribution.high}</span>
                      </div>
                      <ProgressBar value={sus!.distribution.high} max={sus!.responseCount} color="#059669" />
                    </div>
                  ) : (
                    <div className="text-center text-xs text-muted">暂无问卷数据</div>
                  )}
                </div>

                {/* Data Completeness */}
                <div className="rounded-2xl border border-border-light bg-surface p-5
                                shadow-[0_8px_24px_-8px_rgba(0,0,0,0.04)]">
                  <h2 className="mb-3 text-sm font-semibold text-foreground">数据完整度</h2>
                  <div className="space-y-4">
                    <div>
                      <div className="mb-1 flex justify-between text-[11px]">
                        <span className="text-muted">反馈提交率</span>
                        <span className="font-medium text-foreground">
                          {comp!.sessionsWithFeedback} / {sess!.total} ({comp!.sessionsWithFeedbackPct}%)
                        </span>
                      </div>
                      <ProgressBar value={comp!.sessionsWithFeedback} max={sess!.total} color="#059669" />
                    </div>
                    <div>
                      <div className="mb-1 flex justify-between text-[11px]">
                        <span className="text-muted">SUS 问卷回收率</span>
                        <span className="font-medium text-foreground">
                          {comp!.sessionsWithSUS} / {sess!.total} ({comp!.sessionsWithSUSPct}%)
                        </span>
                      </div>
                      <ProgressBar value={comp!.sessionsWithSUS} max={sess!.total} color="#7c3aed" />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Enriched User Table */}
            <div className="overflow-hidden rounded-2xl border border-border-light bg-surface
                            shadow-[0_8px_24px_-8px_rgba(0,0,0,0.04)]">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-light bg-warm-100/50">
                    <ColHeader label="用户ID" sk="userID" />
                    <ColHeader label="目标食物" sk="themeFood" />
                    <ColHeader label="进食次数" sk="foodLogCount" />
                    <ColHeader label="平均分" sk="avgScore" />
                    <ColHeader label="有效实验" sk="confirmedAt" />
                    <ColHeader label="确认时间" sk="confirmedAt" />
                    <ColHeader label="最近活跃" sk="lastActive" />
                    <th className="px-4 py-3 text-right text-[11px] font-medium text-muted">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedUsers.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-8 text-center text-sm text-muted">
                        暂无数据
                      </td>
                    </tr>
                  ) : (
                    sortedUsers.map((u) => (
                      <tr key={u.userID} className="border-t border-border-light hover:bg-warm-100/30 transition-colors">
                        <td className="px-4 py-2.5 text-sm font-medium text-foreground">{u.userID}</td>
                        <td className="px-4 py-2.5 text-sm text-foreground">{u.themeFood}</td>
                        <td className="px-4 py-2.5 text-sm tabular-nums text-foreground">{u.foodLogCount}</td>
                        <td className="px-4 py-2.5 text-sm tabular-nums">
                          {u.avgScore != null ? (
                            <span style={{ color: u.avgScore >= 7 ? '#059669' : u.avgScore >= 4 ? '#f59e0b' : '#e11d48' }}>
                              {u.avgScore}
                            </span>
                          ) : (
                            <span className="text-muted">--</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-sm tabular-nums">
                          {u.bookCount > 0 ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-accent-light px-2 py-0.5 text-xs font-medium text-accent">
                              有效 ✓
                            </span>
                          ) : (
                            <span className="text-xs text-muted">未确认</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-[11px] font-mono text-muted">
                          {formatTimestamp(u.confirmedAt)}
                        </td>
                        <td className="px-4 py-2.5 text-[11px] text-muted" title={u.lastActive ?? undefined}>
                          {relativeTime(u.lastActive)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => removeUser(u.userID)}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1
                                       text-[11px] font-medium text-error
                                       transition-all duration-200 hover:bg-error/10 active:scale-[0.95]"
                          >
                            <Trash size={12} weight="bold" />
                            删除
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Create user form */}
            <div className="rounded-2xl border border-border-light bg-surface p-5
                            shadow-[0_8px_24px_-8px_rgba(0,0,0,0.04)]">
              <h2 className="mb-4 text-sm font-semibold text-foreground">创建新用户</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <label>
                  <div className="mb-1.5 text-xs text-muted">用户ID</div>
                  <input
                    value={newUserID}
                    onChange={(e) => setNewUserID(e.target.value)}
                    placeholder="例如: child01"
                    className="form-input w-full"
                  />
                </label>
                <label>
                  <div className="mb-1.5 text-xs text-muted">密码</div>
                  <input
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="登录密码"
                    className="form-input w-full"
                  />
                </label>
                <label>
                  <div className="mb-1.5 text-xs text-muted">讨厌的食物</div>
                  <input
                    value={newThemeFood}
                    onChange={(e) => setNewThemeFood(e.target.value)}
                    placeholder="胡萝卜"
                    className="form-input w-full"
                  />
                </label>
                <div className="flex items-end">
                  <button
                    onClick={createUser}
                    disabled={!canCreate}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl
                               border border-accent bg-accent px-4 py-2.5
                               text-sm font-semibold text-surface
                               transition-all duration-200 hover:bg-accent-hover active:scale-[0.98]
                               disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus size={16} weight="bold" />
                    {creating ? '创建中...' : '创建'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* No stats loaded yet — show empty table */
          <div className="overflow-hidden rounded-2xl border border-border-light bg-surface
                          shadow-[0_20px_40px_-15px_rgba(0,0,0,0.04)]">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border-light bg-warm-100/50">
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted">用户ID</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted">首次登录</th>
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted">讨厌的食物</th>
                  <th className="px-5 py-3 text-right text-xs font-medium text-muted">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-sm text-muted">
                      暂无数据，请先点击"加载数据"
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.userID} className="border-t border-border-light">
                      <td className="px-5 py-3 text-sm font-medium text-foreground">{u.userID}</td>
                      <td className="px-5 py-3 text-sm text-muted">
                        {u.firstLogin ? (
                          <span className="inline-flex rounded-full bg-accent-light px-2 py-0.5 text-xs font-medium text-accent">
                            是
                          </span>
                        ) : (
                          <span className="text-xs text-muted">否</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-sm text-foreground">{u.themeFood}</td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => removeUser(u.userID)}
                          className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5
                                     text-xs font-medium text-error
                                     transition-all duration-200 hover:bg-error/10 active:scale-[0.95]"
                        >
                          <Trash size={14} weight="bold" />
                          删除
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
