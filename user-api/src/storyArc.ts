export type StoryArcProfileInput = {
  userID: string;
  themeFood: string;
  nickname?: string | null;
  gender?: string | null;
  age?: number | null;
};

export type StoryArcExtraProfile = {
  age?: number | null;
  interest_theme?: unknown;
  optional_preferences?: unknown;
};

const DEFAULT_INTEREST_THEME = "light_fantasy_grounded_social_world";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeText(value: string | null | undefined, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const v = value.trim();
  return v.length > 0 ? v : fallback;
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const v = item.trim();
    if (v.length > 0) out.push(v);
  }
  return out;
}

export function buildStoryArcUserProfile(
  input: StoryArcProfileInput,
  options?: {
    seedProfile?: Record<string, unknown> | null;
    extraProfile?: StoryArcExtraProfile | null;
  },
): Record<string, unknown> {
  const seed = isRecord(options?.seedProfile) ? options?.seedProfile as Record<string, unknown> : {};
  const extra = isRecord(options?.extraProfile) ? options?.extraProfile as StoryArcExtraProfile : {};
  const seedOptionalPrefs = isRecord(seed.optional_preferences) ? seed.optional_preferences : {};
  const extraOptionalPrefs = isRecord(extra.optional_preferences) ? extra.optional_preferences : {};
  const optionalPreferences = {
    ...seedOptionalPrefs,
    ...extraOptionalPrefs,
  };

  const nickname = normalizeText(input.nickname ?? undefined, normalizeText(input.userID, "unspecified"));
  const targetFoodCategory = normalizeText(
    input.themeFood,
    normalizeText(String(seed.target_food_category ?? ""), "unspecified"),
  );
  const age = typeof input.age === "number" && Number.isFinite(input.age) && input.age > 0
    ? Math.floor(input.age)
    : (typeof extra.age === "number" && Number.isFinite(extra.age) && extra.age > 0
      ? Math.floor(extra.age)
      : (typeof seed.age === "number" && Number.isFinite(seed.age) ? Math.floor(seed.age) : 4));
  const interestTheme = normalizeStringList(extra.interest_theme ?? seed.interest_theme ?? []);
  const finalInterestTheme = interestTheme.length > 0 ? interestTheme : [DEFAULT_INTEREST_THEME];

  return {
    ...seed,
    nickname,
    age,
    gender: normalizeText(input.gender ?? undefined, normalizeText(String(seed.gender ?? ""), "unspecified")),
    target_food_category: targetFoodCategory,
    interest_theme: finalInterestTheme,
    optional_preferences: optionalPreferences,
  };
}
