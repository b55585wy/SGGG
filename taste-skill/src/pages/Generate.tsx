import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkle, CaretDown, CaretUp, SignOut, User } from '@phosphor-icons/react';
import { storyGenerate } from '@/lib/api';
import { logout, currentUser } from '@/hooks/useAuth';
import type { StoryType } from '@/types/story';

const STORY_TYPES: { value: StoryType; label: string }[] = [
  { value: 'adventure', label: 'Adventure' },
  { value: 'daily_life', label: 'Daily Life' },
  { value: 'fantasy', label: 'Fantasy' },
  { value: 'animal_friend', label: 'Animal Friend' },
  { value: 'superhero', label: 'Superhero' },
];

const MOODS = ['happy', 'neutral', 'fussy', 'tired', 'excited'];

export default function GeneratePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const username = currentUser();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const [nickname, setNickname] = useState('');
  const [age, setAge] = useState(4);
  const [gender, setGender] = useState('boy');
  const [targetFood, setTargetFood] = useState('');
  const [mealScore, setMealScore] = useState(3);
  const [mealText, setMealText] = useState('');
  const [possibleReason, setPossibleReason] = useState('');
  const [sessionMood, setSessionMood] = useState('neutral');
  const [storyType, setStoryType] = useState<StoryType>('adventure');
  const [difficulty, setDifficulty] = useState('medium');
  const [pages, setPages] = useState(8);
  const [interactiveDensity, setInteractiveDensity] = useState('medium');
  const [storyOpen, setStoryOpen] = useState(false);

  // 读取上次保存的孩子档案
  useEffect(() => {
    try {
      const saved = localStorage.getItem('storybook_child_profile');
      if (saved) {
        const { nickname: n, age: a, gender: g } = JSON.parse(saved);
        if (n) setNickname(n);
        if (a) setAge(a);
        if (g) setGender(g);
      }
    } catch { /* ignore */ }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim() || !targetFood.trim()) { setError('Please fill in nickname and target food.'); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await storyGenerate({
        child_profile: { nickname: nickname.trim(), age, gender },
        meal_context: { target_food: targetFood.trim(), meal_score: mealScore, meal_text: mealText.trim(), possible_reason: possibleReason.trim() || undefined, session_mood: sessionMood },
        story_config: { story_type: storyType, difficulty, pages, interactive_density: interactiveDensity, must_include_positive_feedback: true, language: 'zh-CN' },
      });
      localStorage.setItem('storybook_child_profile', JSON.stringify({ nickname: nickname.trim(), age, gender }));
      localStorage.setItem('storybook_draft', JSON.stringify(res.draft));
      navigate('/preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed.');
    } finally {
      setLoading(false);
    }
  };

  const spring = { type: 'spring' as const, stiffness: 100, damping: 20 };

  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* ── 顶部 Header ── */}
      <header className="flex-shrink-0 flex items-center justify-between h-11 px-6 bg-[var(--color-surface)]/90 backdrop-blur-sm border-b border-[var(--color-border-light)] z-20">
        <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
          <Sparkle size={13} weight="fill" className="text-[var(--color-accent)]" />
          <span className="font-mono font-medium tracking-wider uppercase">AI Storybook</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
            <User size={13} weight="bold" />{username}
          </span>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--color-muted)] hover:bg-[var(--color-warm-100)] active:scale-[0.98] transition-colors"
          >
            <SignOut size={13} weight="bold" />退出
          </button>
        </div>
      </header>

      {/* ── 主体：左右两栏 ── */}
      <form onSubmit={handleSubmit} className="flex flex-1 overflow-hidden">

        {/* ── 左栏：标题 + 孩子信息 + 进餐信息 ── */}
        <div className="w-[55%] px-12 py-10 overflow-y-auto border-r border-[var(--color-border-light)]">
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={spring} className="mb-8">
            <div className="flex items-center gap-2 mb-2">
              <Sparkle size={20} weight="fill" className="text-[var(--color-accent)]" />
              <span className="text-xs font-mono font-medium tracking-wider text-[var(--color-muted)] uppercase">Story Generator</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tighter leading-none">Create a Story</h1>
            <p className="mt-2 text-sm text-[var(--color-muted)]">Fill in the details to generate a personalized interactive storybook.</p>
          </motion.div>

          {/* Child Profile */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.05 }}
            className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border-light)] p-6 mb-4"
            style={{ boxShadow: '0 20px 40px -15px rgba(0,0,0,0.03)' }}>
            <p className="text-xs font-semibold tracking-wider text-[var(--color-muted)] uppercase mb-4">Child Profile</p>
            <div className="space-y-4">
              <Field label="Nickname">
                <input type="text" value={nickname} onChange={e => setNickname(e.target.value)}
                  placeholder="Child's name" className="form-input" required />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Age">
                  <select value={age} onChange={e => setAge(+e.target.value)} className="form-input">
                    {[2,3,4,5,6,7].map(a => <option key={a} value={a}>{a} yrs</option>)}
                  </select>
                </Field>
                <Field label="Gender">
                  <select value={gender} onChange={e => setGender(e.target.value)} className="form-input">
                    <option value="boy">Boy</option><option value="girl">Girl</option>
                  </select>
                </Field>
              </div>
            </div>
          </motion.div>

          {/* Meal Context */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.1 }}
            className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border-light)] p-6"
            style={{ boxShadow: '0 20px 40px -15px rgba(0,0,0,0.03)' }}>
            <p className="text-xs font-semibold tracking-wider text-[var(--color-muted)] uppercase mb-4">Meal Context</p>
            <div className="space-y-4">
              <Field label="Target Food">
                <input type="text" value={targetFood} onChange={e => setTargetFood(e.target.value)}
                  placeholder="e.g. broccoli" className="form-input" required />
              </Field>
              <Field label={`Meal Score: ${mealScore} / 5`}>
                <input type="range" min={1} max={5} value={mealScore}
                  onChange={e => setMealScore(+e.target.value)} className="w-full accent-[var(--color-accent)]" />
              </Field>
              <Field label="Mood">
                <select value={sessionMood} onChange={e => setSessionMood(e.target.value)} className="form-input">
                  {MOODS.map(m => <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>)}
                </select>
              </Field>
              <Field label="Description (optional)">
                <textarea value={mealText} onChange={e => setMealText(e.target.value)}
                  placeholder="Describe the meal situation..." className="form-input resize-none h-20" />
              </Field>
              <Field label="Why refuse? (optional)">
                <input type="text" value={possibleReason} onChange={e => setPossibleReason(e.target.value)}
                  placeholder="e.g. doesn't like the texture" className="form-input" />
              </Field>
            </div>
          </motion.div>
        </div>

        {/* ── 右栏：故事配置 + 提交 ── */}
        <div className="w-[45%] px-10 py-10 flex flex-col overflow-y-auto">

          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.05 }} className="mb-6">
            <p className="text-sm font-semibold tracking-tight">Story Settings</p>
            <p className="text-xs text-[var(--color-muted)] mt-1">Customize how the story is generated.</p>
          </motion.div>

          {/* Story type */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.1 }}
            className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border-light)] p-6 mb-4 space-y-4"
            style={{ boxShadow: '0 20px 40px -15px rgba(0,0,0,0.03)' }}>
            <Field label="Story Type">
              <div className="grid grid-cols-1 gap-2">
                {STORY_TYPES.map(s => (
                  <button type="button" key={s.value} onClick={() => setStoryType(s.value)}
                    className={`py-2 px-4 rounded-xl text-sm font-medium border text-left transition-all active:scale-[0.98]
                      ${storyType === s.value ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]' : 'border-[var(--color-border-light)] hover:border-[var(--color-border)]'}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </Field>
          </motion.div>

          {/* Difficulty + Pages + Density */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.15 }}
            className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border-light)] p-6 mb-4 space-y-4"
            style={{ boxShadow: '0 20px 40px -15px rgba(0,0,0,0.03)' }}>

            {/* Advanced settings toggle */}
            <button type="button" onClick={() => setStoryOpen(v => !v)}
              className="w-full flex items-center justify-between text-left">
              <span className="text-xs font-semibold tracking-wider text-[var(--color-muted)] uppercase">Advanced</span>
              {storyOpen ? <CaretUp size={14} weight="bold" className="text-[var(--color-muted)]" /> : <CaretDown size={14} weight="bold" className="text-[var(--color-muted)]" />}
            </button>
            {storyOpen && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Difficulty">
                    <select value={difficulty} onChange={e => setDifficulty(e.target.value)} className="form-input">
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </Field>
                  <Field label="Interactions">
                    <select value={interactiveDensity} onChange={e => setInteractiveDensity(e.target.value)} className="form-input">
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </Field>
                </div>
                <Field label={`Pages: ${pages}`}>
                  <input type="range" min={6} max={12} value={pages}
                    onChange={e => setPages(+e.target.value)} className="w-full accent-[var(--color-accent)]" />
                </Field>
              </div>
            )}
          </motion.div>

          {/* 弹性空白 */}
          <div className="flex-1" />

          {/* 错误提示 */}
          {error && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="text-sm text-[var(--color-error)] bg-[var(--color-error-light)] px-4 py-3 rounded-xl mb-4">
              {error}
            </motion.p>
          )}

          {/* 提交按钮 */}
          <button type="submit" disabled={loading}
            className="w-full py-4 rounded-xl font-semibold text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all text-base">
            {loading
              ? <span className="flex items-center justify-center gap-2">
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Generating...
                </span>
              : '✦  Generate Story'}
          </button>
        </div>

      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-[var(--color-muted)] tracking-wide">{label}</label>
      {children}
    </div>
  );
}
