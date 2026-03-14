
import os
import json
from openai import AzureOpenAI
from typing import Optional, Dict, Any, List

# 从.env文件中读取Azure OpenAI配置
from dotenv import load_dotenv
load_dotenv()
endpoint = os.getenv("AZURE_OPENAI_ENDPOINT")
deployment = os.getenv("AZURE_OPENAI_DEPLOYMENT", "storybuddy_generate")
api_version = os.getenv("AZURE_OPENAI_API_VERSION", "2024-12-01-preview")
subscription_key = os.getenv("AZURE_OPENAI_API_KEY")

if not endpoint or not subscription_key:
    raise RuntimeError(
        "Missing Azure OpenAI config. Set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY (and optionally AZURE_OPENAI_DEPLOYMENT / AZURE_OPENAI_API_VERSION)."
    )

client = AzureOpenAI(
    api_version=api_version,
    azure_endpoint=endpoint,
    api_key=subscription_key,
)


# 读取design_consideration.json
with open("design_consideration.json", "r") as f:
    design_consideration = json.load(f)

# 读取user_profile.json
with open("user_profile.json", "r") as f:
    user_profile = json.load(f)

# 读取 basic_constraints.json
with open("basic_constraints.json", "r") as f:
    basic_constraints = json.load(f)

# 读取 story_bible_template_optional_library.json
with open("story_bible_template_optional_library.json", "r") as f:
    story_bible_template_optional_library = json.load(f)


# -----------------------------
# Story Background Framework Generator (v4):
# - Generate only the reusable background/world framework.
# - Explicitly integrate design_consideration and basic_constraints as effective_inputs.
# - Do NOT generate episode libraries or page-level planning.
# - Use developer messages for hard product rules.
# - Pre-select ONE template in code (do NOT send the entire library).
# - Send ONLY real user data as user message.
# - Use Structured Outputs (json_schema) to keep the background schema compact.
# -----------------------------

VALID_MODES = [
    "realistic_everyday",
    "light_fantasy_familiar",
    "hybrid_expository_narrative",
]

TEMPLATE_ID_BY_MODE = {
    "realistic_everyday": "T2_everyday_cause_effect_routine",
    "light_fantasy_familiar": "T3_light_fantasy_grounded_social_world",
    "hybrid_expository_narrative": "T1_grounded_expository_exploration",
}

T4_TEMPLATE_ID = "T4_journey_discovery_framework"

T4_TRIGGER_KEYWORDS = [
    "train", "trains", "rail", "railway", "station", "subway", "metro",
    "bus", "buses", "car", "cars", "truck", "trucks", "vehicle", "vehicles",
    "rocket", "rockets", "airplane", "plane", "ship", "boat",
    "journey", "travel", "trip", "map", "route", "adventure", "explore", "exploration"
]


def _is_schema_placeholder_string(x: object) -> bool:
    """Detect common 'schema description' placeholders mistakenly passed as values."""
    if not isinstance(x, str):
        return False
    s = x.strip().lower()
    return (
        "(e.g" in s
        or "integer" in s
        or "array" in s
        or "recommended" in s
        or "default" in s
        or "profiles" in s
        or s.startswith("string")
    )


def _normalize_string_list(value: Any) -> List[str]:
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, list):
        return []
    out: List[str] = []
    for item in value:
        if isinstance(item, str):
            cleaned = item.strip()
            if cleaned:
                out.append(cleaned)
    return out


def _parse_jsonish_value(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    s = value.strip()
    if not s:
        return value
    if s.startswith("[") or s.startswith("{"):
        try:
            return json.loads(s)
        except json.JSONDecodeError:
            return value
    if s.isdigit():
        try:
            return int(s)
        except ValueError:
            return value
    return value


def select_preferred_mode(user_profile_dict: Dict[str, Any]) -> Optional[str]:
    optional_preferences = user_profile_dict.get("optional_preferences", {})
    if not isinstance(optional_preferences, dict):
        return None
    mode = optional_preferences.get("preferred_story_mode")
    return mode if mode in VALID_MODES else None


def should_prefer_t4(user_profile_dict: Dict[str, Any]) -> bool:
    themes = _normalize_string_list(user_profile_dict.get("interest_theme", []))
    for theme in themes:
        theme_lower = theme.lower()
        for keyword in T4_TRIGGER_KEYWORDS:
            if keyword in theme_lower:
                return True
    return False


def select_template_one(
    library: Dict[str, Any],
    preferred_mode: Optional[str],
    user_profile_dict: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    items = library.get("story_bible_template_optional_library")
    if not isinstance(items, list):
        return None

    item_by_id = {
        item.get("id"): item.get("story_bible_template_optional")
        for item in items
        if isinstance(item, dict)
        and isinstance(item.get("id"), str)
        and isinstance(item.get("story_bible_template_optional"), dict)
    }

    candidate_ids: List[str] = []

    if should_prefer_t4(user_profile_dict):
        candidate_ids.append(T4_TEMPLATE_ID)

    if preferred_mode:
        candidate_ids.append(TEMPLATE_ID_BY_MODE[preferred_mode])
        if T4_TEMPLATE_ID not in candidate_ids:
            candidate_ids.append(T4_TEMPLATE_ID)
    else:
        candidate_ids.extend([
            T4_TEMPLATE_ID,
            TEMPLATE_ID_BY_MODE["light_fantasy_familiar"],
            TEMPLATE_ID_BY_MODE["realistic_everyday"],
            TEMPLATE_ID_BY_MODE["hybrid_expository_narrative"],
        ])

    seen = set()
    ordered_candidate_ids: List[str] = []
    for template_id in candidate_ids:
        if template_id not in seen:
            seen.add(template_id)
            ordered_candidate_ids.append(template_id)

    for template_id in ordered_candidate_ids:
        template_payload = item_by_id.get(template_id)
        if isinstance(template_payload, dict):
            return {
                "id": template_id,
                **template_payload,
            }
    return None


def normalize_user_profile(user_profile_dict: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize obvious schema-placeholder inputs into safer shapes."""
    out = dict(user_profile_dict) if isinstance(user_profile_dict, dict) else {}

    age = out.get("age")
    if isinstance(age, str) and age.strip().isdigit():
        out["age"] = int(age.strip())
    nickname = out.get("nickname")
    if isinstance(nickname, str):
        out["nickname"] = nickname.strip() or "unspecified"
    else:
        out["nickname"] = "unspecified"

    out["interest_theme"] = _normalize_string_list(out.get("interest_theme", []))

    optional_preferences = out.get("optional_preferences", {})
    if not isinstance(optional_preferences, dict):
        optional_preferences = {}

    optional_preferences["avoid_topics"] = _normalize_string_list(
        optional_preferences.get("avoid_topics", [])
    )

    language_level = optional_preferences.get("language_level")
    if isinstance(language_level, str):
        optional_preferences["language_level"] = language_level.strip() or "unspecified"
    else:
        optional_preferences["language_level"] = "unspecified"

    preferred_story_mode = optional_preferences.get("preferred_story_mode")
    if preferred_story_mode not in VALID_MODES:
        optional_preferences["preferred_story_mode"] = "unspecified"

    out["optional_preferences"] = optional_preferences
    return out


def normalize_basic_constraints(basic_constraints_dict: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(basic_constraints_dict) if isinstance(basic_constraints_dict, dict) else {}

    out["image_count_target"] = _parse_jsonish_value(out.get("image_count_target"))
    out["words_per_page_target_cn"] = _parse_jsonish_value(out.get("words_per_page_target_cn"))

    word_count_profiles = out.get("word_count_cn_profiles", {})
    if isinstance(word_count_profiles, dict):
        normalized_profiles: Dict[str, Any] = {}
        for key, value in word_count_profiles.items():
            normalized_profiles[key] = _parse_jsonish_value(value)
        out["word_count_cn_profiles"] = normalized_profiles

    three_element_minimums = out.get("three_element_minimums", {})
    if isinstance(three_element_minimums, dict):
        normalized_three_elements: Dict[str, Any] = {}
        for key, value in three_element_minimums.items():
            normalized_three_elements[key] = _parse_jsonish_value(value)
        out["three_element_minimums"] = normalized_three_elements

    interaction_constraints = out.get("interaction_constraints", {})
    if isinstance(interaction_constraints, dict):
        normalized_interaction: Dict[str, Any] = {}
        for key, value in interaction_constraints.items():
            normalized_interaction[key] = _parse_jsonish_value(value)
        out["interaction_constraints"] = normalized_interaction

    out["safety_rules"] = _normalize_string_list(out.get("safety_rules", []))
    return out


def build_developer_policy() -> str:
    return """You are the STORY BACKGROUND FRAMEWORK MODULE for a picky-eating intervention picture-book system for children ages 3–6.

Your job:
- Generate exactly one reusable BACKGROUND-LEVEL STORY FRAMEWORK.
- The output should define the stable world/background under which many concrete stories can later happen.
- Do NOT write episode pages, dialogues, per-page scripts, image prompts, episode pattern libraries, or page-level plans.

Output rules:
- Output MUST be a single valid JSON object and nothing else.
- Do NOT use placeholder tokens like {target_food_category} or <...>.
- Do NOT invent user data. If truly unknown for optional descriptive fields, use the literal string: "unspecified".
- The framework itself does not need to be in Chinese.

Preference handling:
- If user_profile.optional_preferences.preferred_story_mode is valid, treat it as a strong base preference for selecting and adapting the overall framework.
- Use the corresponding template as the starting point, but do NOT treat preferred_story_mode as an absolute lock if a nearby mode better preserves grounding and safety.
- interest_theme should strongly influence world imagery, recurring motifs, and overall appeal, but it does NOT need to appear explicitly in every field.
- If interest_theme is provided, make sure at least one of series_premise.core_world_concept, world_setting.setting_name, recurring_elements.recurring_object, or recurring_elements.recurring_phrase visibly reflects it.
    - language_level must be considered at framework stage: use it to calibrate naming complexity, phrase simplicity, and familiarity of the world description, while keeping the framework reusable and compact.

Child-avatar requirement:
- The framework MUST include a dedicated child virtual avatar representing the child user.
- If user_profile.nickname is provided, preserve it verbatim as the child's avatar anchor in the framework.
- The child virtual avatar must remain present across later stories under this framework.
- Other protagonist/support slots may also exist, but they must not replace the child virtual avatar.

Core purpose (hard boundaries):
- This framework is for picky-eating intervention.
- target_food_category MUST be preserved verbatim and remain a narrative anchor, not decorative background. The same anchor should remain central when later concrete food instances are generated under this framework.
- Optimize willingness-to-try (approach, smell, lick, tiny bite), NOT quantity or completion.
- Use non-mealtime, low-pressure, sustainable playful narrative.
- Avoid shaming, threats, coercion, punishment language, moralizing commands, transactional reward framing, stigmatizing language, and medical advice.
- If fantasy is used, it must be light and grounded in real life.
- Do not create a fully imaginary world.
- Do not use magic to solve eating-related challenges.

Structure expectations:
    - Output a stable recurring story world, such as a stable protagonist/avatar slot plus a stable world/background under which different later events, visitors, or discoveries can happen.
    - The child virtual avatar should be the persistent child-centered anchor of the framework, even if other recurring characters or guide roles are also included.
- Do NOT output a staged curriculum, a rigid progression ladder, or a phase-based training sequence.

Design-principle usage:
- Explicitly use the provided design_consideration as intervention guidance.
- Align the framework with the following priorities already reflected in the design_consideration: cognitive/experiential change and willingness-to-try over eating completion or quantity; non-mealtime low-pressure long-term reinforcement; avoidance of taskification and transaction framing; and low-burden, non-coercive parent-in-the-loop scaffolding when relevant.
- The framework should naturally support three recurring content elements across later stories: sensory descriptions, contextualized food knowledge, and role-model narratives. Support them at background/world level, but do NOT output episode libraries, per-episode patterns, or quotas.
- Use basic_constraints as compatibility guidance for later story generation.
- Treat basic_constraints.safety_rules as hard safety guardrails.
- Treat basic_constraints.language, interaction constraints, and downstream story-form constraints as reference inputs for compatibility, but do NOT surface page-count logic or per-episode quotas in the framework output.

Age appropriateness and conflict resolution:
- Keep the framework warm, concrete, and low cognitive load for children ages 3–6.
- If constraints conflict, prioritize: safety and age-appropriateness > design-consideration alignment > picky-eating goal > continuity > creativity.

Safety / exclusions:
- user_profile.optional_preferences.avoid_topics contains hard exclusions. Do NOT include those topics, motifs, or scenes anywhere in the framework.

Framework scope:
- This module should output only the stable background/world framework.
- Do NOT include page-count logic, per-episode interaction quotas, episode pattern libraries, concrete food-instance selection policies, or a fixed default single-episode progression.
- Keep the framework compact and reusable across many later stories.""".strip()


def build_run_config(
    selected_template: Optional[Dict[str, Any]],
    user_profile_dict: Dict[str, Any],
    design_consideration_dict: Dict[str, Any],
    basic_constraints_dict: Dict[str, Any],
) -> Dict[str, Any]:
    optional_preferences = user_profile_dict.get("optional_preferences", {})
    if not isinstance(optional_preferences, dict):
        optional_preferences = {}

    effective_inputs = {
        "user_profile": {
            "age": user_profile_dict.get("age", "unspecified"),
            "nickname": user_profile_dict.get("nickname", "unspecified"),
            "target_food_category": user_profile_dict.get("target_food_category", "unspecified"),
            "interest_theme": user_profile_dict.get("interest_theme", []),
            "optional_preferences": {
                "preferred_story_mode": select_preferred_mode(user_profile_dict) or "unspecified",
                "avoid_topics": _normalize_string_list(optional_preferences.get("avoid_topics", [])),
                "language_level": optional_preferences.get("language_level", "unspecified"),
            },
        },
        "design_consideration": design_consideration_dict,
        "basic_constraints": {
            "framework_relevant_guardrails": {
                "language": basic_constraints_dict.get("language", "unspecified"),
                "safety_rules": basic_constraints_dict.get("safety_rules", []),
                "interaction_constraints": basic_constraints_dict.get("interaction_constraints", {}),
            },
            "downstream_story_generation_references": {
                "episode_page_count": basic_constraints_dict.get("episode_page_count", "unspecified"),
                "image_count_target": basic_constraints_dict.get("image_count_target", "unspecified"),
                "words_per_page_target_cn": basic_constraints_dict.get("words_per_page_target_cn", "unspecified"),
                "word_count_cn_profiles": basic_constraints_dict.get("word_count_cn_profiles", "unspecified"),
                "three_element_minimums": basic_constraints_dict.get("three_element_minimums", "unspecified"),
            },
        },
        "selected_template_guidance": selected_template if selected_template else "unspecified",
    }

    return {
        "effective_inputs": effective_inputs,
        "hard_size_limits": {
            "world_setting.core_locations": 2,
            "world_setting.world_rules": 3,
        },
    }


def build_response_format(user_profile_dict: Dict[str, Any]) -> Dict[str, Any]:
    """Structured Outputs schema.

    We lock enums ONLY when the input is clearly a real value.
    """
    allowed_modes = VALID_MODES

    target_food_category = user_profile_dict.get("target_food_category")
    lock_food = (
        isinstance(target_food_category, str)
        and target_food_category.strip()
        and not _is_schema_placeholder_string(target_food_category)
    )

    narrative_mode_schema = {"type": "string", "enum": allowed_modes}
    target_food_schema = {"type": "string", "minLength": 1}
    if lock_food:
        target_food_schema = {"type": "string", "enum": [target_food_category.strip()]}

    nickname = user_profile_dict.get("nickname")
    lock_nickname = (
        isinstance(nickname, str)
        and nickname.strip()
        and nickname.strip() != "unspecified"
        and not _is_schema_placeholder_string(nickname)
    )
    child_nickname_schema = {"type": "string", "minLength": 1}
    if lock_nickname:
        child_nickname_schema = {"type": "string", "enum": [nickname.strip()]}

    return {
        "type": "json_schema",
        "json_schema": {
            "name": "story_background_framework",
            "strict": True,
            "schema": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "title",
                    "narrative_mode",
                    "target_food_category",
                    "target_age_hint",
                    "food_anchor_rule",
                    "series_premise",
                    "world_setting",
                    "child_avatar_slot",
                    "main_avatar_slot",
                    "recurring_elements",
                ],
                "properties": {
                    "title": {"type": "string"},
                    "narrative_mode": narrative_mode_schema,
                    "target_food_category": target_food_schema,
                    "target_age_hint": {"type": "string"},
                    "food_anchor_rule": {"type": "string"},
                    "series_premise": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["one_sentence_logline", "core_world_concept"],
                        "properties": {
                            "one_sentence_logline": {"type": "string"},
                            "core_world_concept": {"type": "string"},
                        },
                    },
                    "world_setting": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["setting_name", "core_locations", "world_rules"],
                        "properties": {
                            "setting_name": {"type": "string"},
                            "core_locations": {
                                "type": "array",
                                "minItems": 2,
                                "maxItems": 2,
                                "items": {"type": "string"},
                            },
                            "world_rules": {
                                "type": "array",
                                "minItems": 3,
                                "maxItems": 3,
                                "items": {"type": "string"},
                            },
                        },
                    },
                    "child_avatar_slot": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["nickname", "role_description", "avatar_usage_rule"],
                        "properties": {
                            "nickname": child_nickname_schema,
                            "role_description": {"type": "string"},
                            "avatar_usage_rule": {"type": "string"},
                        },
                    },
                    "main_avatar_slot": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["slot_name", "role_description"],
                        "properties": {
                            "slot_name": {"type": "string"},
                            "role_description": {"type": "string"},
                        },
                    },
                    "recurring_elements": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": [
                            "opening_ritual",
                            "episode_trigger_style",
                            "closing_hook_style",
                            "recurring_object",
                            "recurring_phrase",
                        ],
                        "properties": {
                            "opening_ritual": {"type": "string"},
                            "episode_trigger_style": {"type": "string"},
                            "closing_hook_style": {"type": "string"},
                            "recurring_object": {"type": "string"},
                            "recurring_phrase": {"type": "string"},
                        },
                    },
                },
            },
        },
    }


# Normalize inputs (do not invent values)
user_profile = normalize_user_profile(user_profile)
basic_constraints = normalize_basic_constraints(basic_constraints)

# Pre-select template based on preferred_story_mode and interest_theme
preferred_mode = select_preferred_mode(user_profile)
selected_template = select_template_one(
    story_bible_template_optional_library,
    preferred_mode,
    user_profile,
)

developer_policy = build_developer_policy()
run_config = build_run_config(
    selected_template,
    user_profile,
    design_consideration,
    basic_constraints,
)

# Only send real user data as user message
user_payload = {
    "user_profile": user_profile,
}

# Structured Outputs schema (locks enums when inputs are real)
response_format = build_response_format(user_profile)

# Call model with developer messages
try:
    response = client.chat.completions.create(
        model=deployment,
        messages=[
            {"role": "developer", "content": developer_policy},
            {"role": "developer", "content": json.dumps(run_config, ensure_ascii=False)},
            {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
        ],
        response_format=response_format,
        max_completion_tokens=16384,
    )
except TypeError:
    # Fallback for older SDKs that don't accept response_format
    response = client.chat.completions.create(
        model=deployment,
        messages=[
            {"role": "developer", "content": developer_policy},
            {"role": "developer", "content": json.dumps(run_config, ensure_ascii=False)},
            {"role": "user", "content": json.dumps(user_payload, ensure_ascii=False)},
        ],
        max_completion_tokens=16384,
    )

raw_content = response.choices[0].message.content
story_arc_framework = json.loads(raw_content)

print(story_arc_framework)
