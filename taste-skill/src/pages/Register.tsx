import { useState } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { BookOpen } from '@phosphor-icons/react';
import { register, isAuthenticated } from '@/hooks/useAuth';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (isAuthenticated()) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim() || !confirmPassword.trim()) {
      setError('请填写所有字段');
      return;
    }
    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }
    if (password.length < 4) {
      setError('密码至少需要 4 位');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      register(username.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left panel */}
      <div className="w-2/5 flex flex-col justify-center items-start px-12 bg-[var(--color-accent-light)]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-6"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--color-accent)] flex items-center justify-center">
              <BookOpen size={22} weight="fill" className="text-white" />
            </div>
            <span className="text-lg font-semibold text-[var(--color-foreground)]">AI 绘本故事系统</span>
          </div>

          <div className="space-y-2">
            <h2 className="text-3xl font-bold text-[var(--color-foreground)] leading-tight">
              用 AI 为孩子生成<br />专属互动绘本故事
            </h2>
            <p className="text-[var(--color-muted)] text-sm leading-relaxed">
              根据孩子的喜好与状态，<br />量身定制每一个故事。
            </p>
          </div>

          <div className="text-6xl select-none">📖✨🌟</div>
        </motion.div>
      </div>

      {/* Right panel */}
      <div className="w-3/5 flex flex-col justify-center items-center bg-[var(--color-surface)] px-16">
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="w-full max-w-sm space-y-8"
        >
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-foreground)]">创建账号</h1>
            <p className="text-sm text-[var(--color-muted)] mt-1">注册后立即开始你的故事之旅</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-foreground)]">用户名</label>
              <input
                className="form-input"
                type="text"
                placeholder="输入用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-foreground)]">密码</label>
              <input
                className="form-input"
                type="password"
                placeholder="输入密码（至少 4 位）"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-foreground)]">确认密码</label>
              <input
                className="form-input"
                type="password"
                placeholder="再次输入密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            {error && (
              <p className="text-sm text-[var(--color-error)] bg-[var(--color-error-light)] px-3 py-2 rounded-lg">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-[var(--color-accent)] text-white text-sm font-semibold hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '注册中…' : '创建账号'}
            </button>
          </form>

          <p className="text-sm text-center text-[var(--color-muted)]">
            已有账号？{' '}
            <Link to="/login" className="text-[var(--color-accent)] font-medium hover:underline">
              登录 →
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
