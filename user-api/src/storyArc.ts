export type StoryArcProfileInput = {
  userID: string;
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
const DEFAULT_PREFERRED_STORY_MODE = "light_fantasy_familiar";
const VALID_PREFERRED_STORY_MODES = new Set([
  "realistic_everyday",
  "light_fantasy_familiar",
  "hybrid_expository_narrative",
  "journey_discovery_framework",
]);

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

function normalizePreferredStoryMode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const mode = value.trim();
  if (!mode) return null;
  const aliases: Record<string, string> = {
    curious_discovery: "hybrid_expository_narrative",
    everyday_routine: "realistic_everyday",
    light_fantasy: "light_fantasy_familiar",
    journey_discovery: "journey_discovery_framework",
  };
  const normalized = aliases[mode] ?? mode;
  return VALID_PREFERRED_STORY_MODES.has(normalized) ? normalized : null;
}

export function buildStoryArcUserProfile(
  input: StoryArcProfileInput,
  options?: {
    seedProfile?: Record<string, unknown> | null;
    extraProfile?: StoryArcExtraProfile | null;
  },
): Record<string, unknown> {
  const seed = isRecord(options?.seedProfile) ? options?.seedProfile as Record<string, unknown> : {};
  const { target_food_category: _legacyFoodCategory, ...seedWithoutFoodCategory } = seed;
  const extra = isRecord(options?.extraProfile) ? options?.extraProfile as StoryArcExtraProfile : {};
  const seedOptionalPrefs = isRecord(seedWithoutFoodCategory.optional_preferences) ? seedWithoutFoodCategory.optional_preferences : {};
  const extraOptionalPrefs = isRecord(extra.optional_preferences) ? extra.optional_preferences : {};
  const optionalPreferences = {
    ...seedOptionalPrefs,
    ...extraOptionalPrefs,
  };
  const preferredStoryMode = normalizePreferredStoryMode(optionalPreferences.preferred_story_mode) ?? DEFAULT_PREFERRED_STORY_MODE;
  const languageLevel = typeof optionalPreferences.language_level === "string" && optionalPreferences.language_level.trim()
    ? optionalPreferences.language_level.trim()
    : "unspecified";
  const avoidTopics = normalizeStringList(optionalPreferences.avoid_topics);

  const nickname = normalizeText(input.nickname ?? undefined, normalizeText(input.userID, "unspecified"));
  const age = typeof input.age === "number" && Number.isFinite(input.age) && input.age > 0
    ? Math.floor(input.age)
    : (typeof extra.age === "number" && Number.isFinite(extra.age) && extra.age > 0
      ? Math.floor(extra.age)
      : (typeof seedWithoutFoodCategory.age === "number" && Number.isFinite(seedWithoutFoodCategory.age) ? Math.floor(seedWithoutFoodCategory.age) : 4));
  const interestTheme = normalizeStringList(extra.interest_theme ?? seedWithoutFoodCategory.interest_theme ?? []);
  const finalInterestTheme = interestTheme.length > 0 ? interestTheme : [DEFAULT_INTEREST_THEME];

  return {
    ...seedWithoutFoodCategory,
    nickname,
    age,
    gender: normalizeText(input.gender ?? undefined, normalizeText(String(seedWithoutFoodCategory.gender ?? ""), "unspecified")),
    interest_theme: finalInterestTheme,
    optional_preferences: {
      ...optionalPreferences,
      preferred_story_mode: preferredStoryMode,
      language_level: languageLevel,
      avoid_topics: avoidTopics,
    },
  };
}
