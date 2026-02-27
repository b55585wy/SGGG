import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkle, CaretDown, CaretUp } from '@phosphor-icons/react';
import { storyGenerate } from '@/lib/api';
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
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ child: true, meal: true, story: false });

  const toggle = (k: string) => setExpanded((p) => ({ ...p, [k]: !p[k] }));

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
      localStorage.setItem('storybook_draft', JSON.stringify(res.draft));
      navigate('/preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pb-12">
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 100, damping: 20 }} className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Sparkle size={20} weight="fill" className="text-[var(--color-accent)]" />
          <span className="text-xs font-mono font-medium tracking-wider text-[var(--color-muted)] uppercase">Story Generator</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tighter leading-none">Create a Story</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)] max-w-[65ch]">Fill in the details to generate a personalized interactive storybook.</p>
      </motion.div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Section title="Child Profile" open={expanded.child} onToggle={() => toggle('child')}>
          <Field label="Nickname"><input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Child's name" className="form-input" required /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Age"><select value={age} onChange={(e) => setAge(+e.target.value)} className="form-input">{[2,3,4,5,6,7].map(a=><option key={a} value={a}>{a} yrs</option>)}</select></Field>
            <Field label="Gender"><select value={gender} onChange={(e) => setGender(e.target.value)} className="form-input"><option value="boy">Boy</option><option value="girl">Girl</option></select></Field>
          </div>
        </Section>

        <Section title="Meal Context" open={expanded.meal} onToggle={() => toggle('meal')}>
          <Field label="Target Food"><input type="text" value={targetFood} onChange={(e) => setTargetFood(e.target.value)} placeholder="e.g. broccoli" className="form-input" required /></Field>
          <Field label={`Meal Score: ${mealScore}/5`}><input type="range" min={1} max={5} value={mealScore} onChange={(e) => setMealScore(+e.target.value)} className="w-full accent-[var(--color-accent)]" /></Field>
          <Field label="Description"><textarea value={mealText} onChange={(e) => setMealText(e.target.value)} placeholder="Describe the meal..." className="form-input resize-none h-20" /></Field>
          <Field label="Possible Reason"><input type="text" value={possibleReason} onChange={(e) => setPossibleReason(e.target.value)} placeholder="Why refuse? (optional)" className="form-input" /></Field>
          <Field label="Mood"><select value={sessionMood} onChange={(e) => setSessionMood(e.target.value)} className="form-input">{MOODS.map(m=><option key={m} value={m}>{m[0].toUpperCase()+m.slice(1)}</option>)}</select></Field>
        </Section>

        <Section title="Story Settings" open={expanded.story} onToggle={() => toggle('story')}>
          <Field label="Story Type"><select value={storyType} onChange={(e) => setStoryType(e.target.value as StoryType)} className="form-input">{STORY_TYPES.map(s=><option key={s.value} value={s.value}>{s.label}</option>)}</select></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Difficulty"><select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="form-input"><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></Field>
            <Field label={`Pages: ${pages}`}><input type="range" min={6} max={12} value={pages} onChange={(e) => setPages(+e.target.value)} className="w-full accent-[var(--color-accent)]" /></Field>
          </div>
          <Field label="Interactive Density"><select value={interactiveDensity} onChange={(e) => setInteractiveDensity(e.target.value)} className="form-input"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field>
        </Section>

        {error && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-[var(--color-error)] bg-[var(--color-error-light)] px-4 py-3 rounded-xl">{error}</motion.p>}

        <button type="submit" disabled={loading}
          className="w-full py-3.5 rounded-xl font-semibold text-white bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98] transition-all">
          {loading ? <span className="flex items-center justify-center gap-2"><span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Generating...</span> : 'Generate Story'}
        </button>
      </form>
    </div>
  );
}

function Section({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border-light)] overflow-hidden" style={{ boxShadow: '0 20px 40px -15px rgba(0,0,0,0.03)' }}>
      <button type="button" onClick={onToggle} className="w-full flex items-center justify-between px-5 py-4 text-left">
        <span className="font-semibold text-sm tracking-tight">{title}</span>
        {open ? <CaretUp size={16} weight="bold" className="text-[var(--color-muted)]" /> : <CaretDown size={16} weight="bold" className="text-[var(--color-muted)]" />}
      </button>
      {open && <div className="px-5 pb-5 space-y-4">{children}</div>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><label className="block text-xs font-medium text-[var(--color-muted)] tracking-wide">{label}</label>{children}</div>;
}
