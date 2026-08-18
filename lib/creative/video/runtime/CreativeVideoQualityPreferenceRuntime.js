export const CREATIVE_VIDEO_QUALITY_CONTRACT =
  "CREATIVE_VIDEO_QUALITY_PREFERENCE_V1";

export const CREATIVE_VIDEO_QUALITY_OPTIONS = Object.freeze({
  AUTO: "AUTO",
  HD: "HD",
  FULL_HD: "FULL_HD",
  UHD_4K: "UHD_4K",
});

const QUALITY_DEFINITIONS = Object.freeze({
  AUTO: {
    id: "AUTO",
    label: "Auto",
    short_label: "Auto",
    resolution: null,
    mode: "AUTO",
    description: "Studio resolves the best supported native quality at generation preflight.",
  },
  HD: {
    id: "HD",
    label: "HD",
    short_label: "720p",
    resolution: "720p",
    mode: "MANUAL",
    description: "1280x720 landscape or 720x1280 portrait.",
  },
  FULL_HD: {
    id: "FULL_HD",
    label: "Full HD",
    short_label: "1080p",
    resolution: "1080p",
    mode: "MANUAL",
    description: "1920x1080 landscape or 1080x1920 portrait.",
  },
  UHD_4K: {
    id: "UHD_4K",
    label: "4K UHD",
    short_label: "4K",
    resolution: "4k",
    mode: "MANUAL",
    description: "3840x2160 landscape or 2160x3840 portrait when the selected provider supports native 4K.",
  },
});

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export function normalizeCreativeVideoQuality(value) {
  const normalized = text(value)
    .replaceAll("-", "_")
    .replaceAll(" ", "_")
    .toUpperCase();

  if (["720P", "720", "HD"].includes(normalized)) return "HD";
  if (["1080P", "1080", "FULL_HD", "FHD"].includes(normalized)) {
    return "FULL_HD";
  }
  if (["4K", "UHD", "UHD_4K", "2160P"].includes(normalized)) {
    return "UHD_4K";
  }
  return "AUTO";
}

export function creativeVideoQualityDefinition(value) {
  return QUALITY_DEFINITIONS[normalizeCreativeVideoQuality(value)];
}

export function creativeVideoQualityFromProject(project = {}) {
  const metadata = object(project.metadata);
  const release = object(metadata.release_quality);
  return normalizeCreativeVideoQuality(
    release.preference ||
    metadata.video_quality_preference ||
    metadata.release_quality_preference ||
    "AUTO",
  );
}

export function creativeVideoQualityDimensions({
  quality,
  aspect_ratio = "16:9",
} = {}) {
  const definition = creativeVideoQualityDefinition(quality);
  const portrait = text(aspect_ratio) === "9:16";
  const dimensions = {
    HD: portrait ? { width: 720, height: 1280 } : { width: 1280, height: 720 },
    FULL_HD: portrait
      ? { width: 1080, height: 1920 }
      : { width: 1920, height: 1080 },
    UHD_4K: portrait
      ? { width: 2160, height: 3840 }
      : { width: 3840, height: 2160 },
  };
  return dimensions[definition.id] || null;
}

export function createCreativeVideoQualityPreference({
  quality,
  selected_by = null,
  source = "STUDIO_MANUAL_CONTROL",
  previous = null,
} = {}) {
  const definition = creativeVideoQualityDefinition(quality);
  return {
    contract: CREATIVE_VIDEO_QUALITY_CONTRACT,
    preference: definition.id,
    mode: definition.mode,
    resolution: definition.resolution,
    label: definition.label,
    source,
    selected_by,
    previous_preference: previous
      ? normalizeCreativeVideoQuality(previous)
      : null,
    updated_at: new Date().toISOString(),
  };
}

export function resolveCreativeVideoExecutionQuality({
  project = {},
  requested_quality = null,
  provider = null,
  model = null,
  duration_seconds = null,
  aspect_ratio = "16:9",
} = {}) {
  const preference = normalizeCreativeVideoQuality(
    requested_quality || creativeVideoQualityFromProject(project),
  );

  const resolvedPreference = preference === "AUTO"
    ? "UHD_4K"
    : preference;
  const definition = creativeVideoQualityDefinition(resolvedPreference);
  const duration = Number(duration_seconds);
  const isGoogleVeo31 =
    text(provider).toLowerCase() === "google-veo" &&
    text(model).startsWith("veo-3.1");

  const reasons = [];
  if (definition.resolution === "4k" && isGoogleVeo31 && duration !== 8) {
    reasons.push("GOOGLE_VEO_4K_REQUIRES_8_SECONDS");
  }
  if (definition.resolution === "1080p" && isGoogleVeo31 && duration !== 8) {
    reasons.push("GOOGLE_VEO_1080P_REQUIRES_8_SECONDS");
  }

  return {
    contract: "CREATIVE_VIDEO_EXECUTION_QUALITY_V1",
    requested_preference: preference,
    resolved_preference: resolvedPreference,
    resolution: definition.resolution,
    label: definition.label,
    aspect_ratio,
    dimensions: creativeVideoQualityDimensions({
      quality: resolvedPreference,
      aspect_ratio,
    }),
    provider_native_frame_rate: isGoogleVeo31 ? 24 : null,
    native_audio: isGoogleVeo31 ? true : null,
    provider,
    model,
    duration_seconds: Number.isFinite(duration) ? duration : null,
    ready: reasons.length === 0,
    reasons,
  };
}

export const CreativeVideoQualityPreferenceRuntime = Object.freeze({
  contract: CREATIVE_VIDEO_QUALITY_CONTRACT,
  options: CREATIVE_VIDEO_QUALITY_OPTIONS,
  normalize: normalizeCreativeVideoQuality,
  definition: creativeVideoQualityDefinition,
  fromProject: creativeVideoQualityFromProject,
  dimensions: creativeVideoQualityDimensions,
  createPreference: createCreativeVideoQualityPreference,
  resolveExecution: resolveCreativeVideoExecutionQuality,
});
