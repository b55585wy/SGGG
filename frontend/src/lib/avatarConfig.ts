/**
 * DiceBear Adventurer avatar configuration.
 * Defines available options with Chinese labels and expression presets.
 */

// ── Skin color palette (warm Asian-friendly tones) ──
export const SKIN_COLORS = [
  { id: 'f2d3b1', label: '浅肤' },
  { id: 'ecad80', label: '自然' },
  { id: 'd5a67e', label: '小麦' },
  { id: '9e5622', label: '深肤' },
] as const

// ── Hair color palette ──
export const HAIR_COLORS = [
  { id: '0e0e0e', label: '黑色' },
  { id: '562306', label: '深棕' },
  { id: '6a4e35', label: '棕色' },
  { id: 'ac6511', label: '栗色' },
  { id: 'e5d7a3', label: '金色' },
  { id: 'afafaf', label: '灰色' },
  { id: 'ab2a18', label: '红棕' },
  { id: '85c2c6', label: '浅蓝' },
  { id: 'dba3be', label: '粉色' },
] as const

// ── Hair styles (short for boys, long for girls, some unisex) ──
export const HAIR_STYLES_SHORT = [
  { id: 'short01', label: '短发1' },
  { id: 'short02', label: '短发2' },
  { id: 'short03', label: '短发3' },
  { id: 'short04', label: '短发4' },
  { id: 'short05', label: '短发5' },
  { id: 'short06', label: '短发6' },
  { id: 'short07', label: '短发7' },
  { id: 'short08', label: '短发8' },
  { id: 'short09', label: '短发9' },
  { id: 'short10', label: '短发10' },
] as const

export const HAIR_STYLES_LONG = [
  { id: 'long01', label: '长发1' },
  { id: 'long02', label: '长发2' },
  { id: 'long03', label: '长发3' },
  { id: 'long04', label: '长发4' },
  { id: 'long05', label: '长发5' },
  { id: 'long06', label: '长发6' },
  { id: 'long07', label: '长发7' },
  { id: 'long08', label: '长发8' },
  { id: 'long09', label: '长发9' },
  { id: 'long10', label: '长发10' },
] as const

// ── Expression presets: eyes + eyebrows + mouth combos ──
export type ExpressionKey = 'happy' | 'encouraging' | 'neutral' | 'gentle'

export const EXPRESSIONS: Record<ExpressionKey, {
  label: string
  eyes: string
  eyebrows: string
  mouth: string
}> = {
  happy: {
    label: '开心',
    eyes: 'variant26',
    eyebrows: 'variant01',
    mouth: 'variant01',
  },
  encouraging: {
    label: '加油',
    eyes: 'variant17',
    eyebrows: 'variant03',
    mouth: 'variant07',
  },
  neutral: {
    label: '平静',
    eyes: 'variant01',
    eyebrows: 'variant02',
    mouth: 'variant03',
  },
  gentle: {
    label: '温柔',
    eyes: 'variant12',
    eyebrows: 'variant06',
    mouth: 'variant14',
  },
}

/** Map a food score (0-10) to an expression key.
 *  Aligned with scoreLabel boundaries: ≤2 拒绝, ≤4 不太喜欢, ≤6 还行, ≤8 比较喜欢, >8 非常喜欢 */
export function scoreToExpression(score: number | null): ExpressionKey {
  if (score === null) return 'neutral'
  if (score >= 7) return 'happy'
  if (score >= 5) return 'encouraging'
  if (score >= 3) return 'gentle'
  if (score >= 1) return 'neutral'
  return 'neutral'
}

/** The base avatar options that users customize */
export type AvatarBase = {
  skinColor: string
  hair: string
  hairColor: string
}

export const DEFAULT_AVATAR: AvatarBase = {
  skinColor: 'f2d3b1',
  hair: 'short01',
  hairColor: '0e0e0e',
}
