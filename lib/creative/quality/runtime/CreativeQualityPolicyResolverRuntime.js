import {
  CREATIVE_SEMANTIC_QUALITY_CHECKS,
} from "./CreativeSemanticQualityRuntime";

const TEMPORAL_TYPES = new Set([
  "VIDEO",
  "FILM",
  "ANIMATION",
  "TEMPORAL",
  "REEL",
  "TRAILER",
  "COMMERCIAL",
  "MOTION",
]);

const STILL_TYPES = new Set([
  "IMAGE",
  "STILL",
  "POSTER",
  "BANNER",
  "PHOTO",
  "GRAPHIC",
]);

const AUDIO_TYPES = new Set([
  "AUDIO",
  "MUSIC",
  "VOICE",
  "PODCAST",
  "SONG",
]);

const DOCUMENT_TYPES = new Set([
  "DOCUMENT",
  "MENU",
  "BROCHURE",
  "REPORT",
  "PRESENTATION",
  "DECK",
]);

const NON_TEMPORAL_SEMANTIC_EXCLUSIONS = new Set([
  "motion_cadence",
  "performance_authenticity",
  "lip_synchronisation",
  "pacing_and_transitions",
  "music_and_sound_design",
  "mix_hierarchy_and_silence",
  "subtitle_integrity",
]);

const AUDIO_SEMANTIC_CHECKS = new Set([
  "music_and_sound_design",
  "mix_hierarchy_and_silence",
  "brand_truth_and_claims",
  "cultural_fit",
  "accessibility",
  "narrative_progression",
  "emotional_arc",
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function contextFor({ mission = {}, project = {} } = {}) {
  const missionMetadata = object(mission.metadata);
  const projectMetadata = object(project.metadata);
  const productionType = upper(
    project.production_type ||
    projectMetadata.production_type ||
    missionMetadata.production_type,
  ) || "CAMPAIGN";
  const duration = finite(
    project.target_duration ??
    projectMetadata.target_duration ??
    missionMetadata.target_duration,
  );
  const channels = [...new Set([
    ...list(project.target_channels),
    ...list(mission.channels),
  ].map((value) => text(value).toLowerCase()).filter(Boolean))];
  const temporal = TEMPORAL_TYPES.has(productionType);
  const still = STILL_TYPES.has(productionType);
  const audio = AUDIO_TYPES.has(productionType);
  const document = DOCUMENT_TYPES.has(productionType);
  const shortForm = temporal && duration !== null && duration <= 30;
  const social = channels.some((channel) => [
    "facebook",
    "instagram",
    "tiktok",
    "youtube",
    "shorts",
    "reels",
    "story",
  ].includes(channel));

  return {
    production_type: productionType,
    duration_seconds: duration,
    channels,
    temporal,
    still,
    audio,
    document,
    short_form: shortForm,
    social,
  };
}

function profileId(context) {
  if (context.temporal && context.short_form && context.social) {
    return "SHORT_FORM_SOCIAL_PREMIUM";
  }
  if (context.temporal) return "TEMPORAL_PREMIUM";
  if (context.still) return "STILL_PREMIUM";
  if (context.audio) return "AUDIO_PREMIUM";
  if (context.document) return "DOCUMENT_PREMIUM";
  return "UNIVERSAL_CREATIVE_PREMIUM";
}

function validateCreativePolicy(policy = {}) {
  const value = object(policy);
  const minimumSceneScore = finite(value.minimum_scene_score);
  const regenerateBelowScore = finite(value.regenerate_below_score);
  const booleanFields = [
    "require_brand_fit",
    "require_non_ai_feel",
    "require_identity_continuity",
    "require_product_continuity",
    "require_story_progression",
  ];

  return Boolean(
    text(value.version) &&
    minimumSceneScore !== null &&
    minimumSceneScore >= 0 &&
    minimumSceneScore <= 100 &&
    regenerateBelowScore !== null &&
    regenerateBelowScore >= 0 &&
    regenerateBelowScore <= minimumSceneScore &&
    booleanFields.every((field) => typeof value[field] === "boolean")
  );
}

function validateSemanticPolicy(policy = {}) {
  const value = object(policy);
  const validChecks = new Set(CREATIVE_SEMANTIC_QUALITY_CHECKS);
  const requiredChecks = list(value.required_checks).map(text).filter(Boolean);
  const minimumConfidence = finite(value.minimum_confidence);
  const minimumScore = finite(value.minimum_score);

  return Boolean(
    text(value.version) &&
    requiredChecks.length &&
    requiredChecks.every((check) => validChecks.has(check)) &&
    minimumConfidence !== null &&
    minimumConfidence >= 0 &&
    minimumConfidence <= 100 &&
    minimumScore !== null &&
    minimumScore >= 0 &&
    minimumScore <= 100 &&
    typeof value.require_audio_review === "boolean"
  );
}

function generatedCreativePolicy(context) {
  const storyRequired = context.temporal || context.audio || !(
    context.still || context.document
  );

  return {
    version: "AVANTIQO_CREATIVE_QUALITY_V1",
    minimum_scene_score: context.still ? 92 : 90,
    regenerate_below_score: context.still ? 90 : 88,
    require_brand_fit: true,
    require_non_ai_feel: true,
    require_identity_continuity: true,
    require_product_continuity: true,
    require_story_progression: storyRequired,
  };
}

function requiredSemanticChecks(context) {
  if (context.audio) {
    return CREATIVE_SEMANTIC_QUALITY_CHECKS.filter((check) =>
      AUDIO_SEMANTIC_CHECKS.has(check),
    );
  }
  if (context.temporal) return [...CREATIVE_SEMANTIC_QUALITY_CHECKS];
  return CREATIVE_SEMANTIC_QUALITY_CHECKS.filter((check) =>
    !NON_TEMPORAL_SEMANTIC_EXCLUSIONS.has(check),
  );
}

function generatedSemanticPolicy(context) {
  return {
    version: "AVANTIQO_SEMANTIC_QUALITY_V1",
    required_checks: requiredSemanticChecks(context),
    minimum_confidence: 75,
    minimum_score: context.still ? 90 : 88,
    require_audio_review: context.temporal || context.audio,
  };
}

function explicitCreativePolicy(mission = {}, project = {}) {
  const projectPolicy = object(project.metadata?.creative_quality_policy);
  if (Object.keys(projectPolicy).length) return projectPolicy;
  return object(mission.metadata?.creative_quality_policy);
}

function explicitSemanticPolicy(mission = {}, project = {}) {
  const projectPolicy = object(project.metadata?.semantic_quality_policy);
  if (Object.keys(projectPolicy).length) return projectPolicy;
  return object(mission.metadata?.semantic_quality_policy);
}

export const CreativeQualityPolicyResolverRuntime = {
  resolve({ mission = {}, project = {} } = {}) {
    const context = contextFor({ mission, project });
    const profile = profileId(context);
    const explicitCreative = explicitCreativePolicy(mission, project);
    const explicitSemantic = explicitSemanticPolicy(mission, project);

    if (Object.keys(explicitCreative).length && !validateCreativePolicy(explicitCreative)) {
      throw new Error("CREATIVE_EXPLICIT_QUALITY_POLICY_INVALID");
    }
    if (Object.keys(explicitSemantic).length && !validateSemanticPolicy(explicitSemantic)) {
      throw new Error("CREATIVE_EXPLICIT_SEMANTIC_QUALITY_POLICY_INVALID");
    }

    const creativePolicy = Object.keys(explicitCreative).length
      ? explicitCreative
      : generatedCreativePolicy(context);
    const semanticPolicy = Object.keys(explicitSemantic).length
      ? explicitSemantic
      : generatedSemanticPolicy(context);

    return {
      profile_id: profile,
      context,
      creative_quality_policy: creativePolicy,
      semantic_quality_policy: semanticPolicy,
      creative_policy_source: Object.keys(explicitCreative).length
        ? "EXPLICIT"
        : "CANONICAL_CONTEXT_PROFILE",
      semantic_policy_source: Object.keys(explicitSemantic).length
        ? "EXPLICIT"
        : "CANONICAL_CONTEXT_PROFILE",
      resolver_version: "CREATIVE_QUALITY_POLICY_RESOLVER_V1",
    };
  },
};
