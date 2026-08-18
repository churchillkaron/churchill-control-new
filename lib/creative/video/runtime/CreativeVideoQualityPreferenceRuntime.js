export const CREATIVE_VIDEO_QUALITY_CONTRACT =
  "CREATIVE_VIDEO_QUALITY_PREFERENCE_V3";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function key(value) {
  return text(value).toLowerCase();
}

function profileFrom(value = {}) {
  const source = object(value);
  return object(source.video_capabilities || source);
}

function normalizeOption(option = {}) {
  const id = key(option.id);
  return id
    ? {
        ...object(option),
        id,
        label: text(option.label) || text(option.id),
        short_label: text(option.short_label) || text(option.id),
      }
    : null;
}

function optionsFromProfile(profile = {}) {
  return list(profile.resolution_options)
    .map(normalizeOption)
    .filter(Boolean);
}

function optionMap(profile = {}) {
  return new Map(optionsFromProfile(profile).map((option) => [option.id, option]));
}

function autoOption(profile = {}) {
  const option = normalizeOption(profile.auto_option || {});
  return option ? { ...option, mode: "AUTO", resolution: null } : null;
}

function dimensionsForOption(option = {}, aspectRatio = "") {
  const dimensions = object(
    object(option.dimensions_by_aspect_ratio)[text(aspectRatio)],
  );
  const width = Number(dimensions.width);
  const height = Number(dimensions.height);
  return Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
    ? { width, height }
    : null;
}

function resolutionConstraint(profile = {}, resolution = "") {
  return object(object(profile.resolution_constraints)[key(resolution)]);
}

function allowedDurations(constraint = {}) {
  return list(constraint.allowed_duration_seconds)
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0);
}

export function normalizeCreativeVideoQuality(value) {
  return key(value) || null;
}

export function creativeVideoCapabilityProfile(value = {}) {
  const profile = profileFrom(value);
  return {
    ...profile,
    auto_option: autoOption(profile),
    resolution_options: optionsFromProfile(profile),
    supported_resolutions: list(profile.supported_resolutions).map(key).filter(Boolean),
    auto_resolution_priority: list(profile.auto_resolution_priority).map(key).filter(Boolean),
    supported_aspect_ratios: list(profile.supported_aspect_ratios).map(text).filter(Boolean),
  };
}

export function creativeVideoQualityDefinition(value, providerCapabilities = {}) {
  const profile = creativeVideoCapabilityProfile(providerCapabilities);
  const selection = normalizeCreativeVideoQuality(value);
  if (profile.auto_option && selection === profile.auto_option.id) {
    return profile.auto_option;
  }
  const option = optionMap(profile).get(selection);
  return option ? { ...option, resolution: option.id, mode: "MANUAL" } : null;
}

export function creativeVideoQualityFromProject(project = {}) {
  const metadata = object(project.metadata);
  const release = object(metadata.release_quality);
  return normalizeCreativeVideoQuality(
    release.resolution ||
    release.preference ||
    metadata.video_quality_resolution ||
    metadata.video_quality_preference,
  );
}

export function creativeVideoQualityDimensions({ quality, aspect_ratio = "", provider_capabilities = {} } = {}) {
  const definition = creativeVideoQualityDefinition(quality, provider_capabilities);
  return definition?.resolution
    ? dimensionsForOption(definition, aspect_ratio)
    : null;
}

export function createCreativeVideoQualityPreference({ quality, provider_capabilities = {}, selected_by = null, source = "STUDIO_MANUAL_CONTROL", previous = null } = {}) {
  const profile = creativeVideoCapabilityProfile(provider_capabilities);
  const requested = normalizeCreativeVideoQuality(quality) || profile.auto_option?.id || null;
  const definition = creativeVideoQualityDefinition(requested, profile);
  if (!definition) throw new Error(`VIDEO_QUALITY_NOT_CONFIGURED:${text(quality) || "missing"}`);

  return {
    contract: CREATIVE_VIDEO_QUALITY_CONTRACT,
    preference: definition.id,
    mode: definition.mode,
    resolution: definition.resolution,
    label: definition.label,
    short_label: definition.short_label,
    source,
    selected_by,
    previous_preference: previous ? normalizeCreativeVideoQuality(previous) : null,
    updated_at: new Date().toISOString(),
  };
}

export function resolveCreativeVideoExecutionQuality({ project = {}, requested_quality = null, provider = null, model = null, duration_seconds = null, aspect_ratio = "", provider_capabilities = {} } = {}) {
  const profile = creativeVideoCapabilityProfile(provider_capabilities);
  const selection = normalizeCreativeVideoQuality(
    requested_quality || creativeVideoQualityFromProject(project),
  ) || profile.auto_option?.id || null;
  const available = optionMap(profile);
  const isAuto = Boolean(profile.auto_option && selection === profile.auto_option.id);

  let resolution = isAuto ? null : selection;
  if (isAuto) {
    const priority = profile.auto_resolution_priority.length
      ? profile.auto_resolution_priority
      : profile.supported_resolutions;
    resolution = priority.find((candidate) => available.has(candidate)) || null;
  }

  const definition = resolution ? available.get(resolution) || null : null;
  const duration = Number(duration_seconds);
  const reasons = [];

  if (!definition) {
    reasons.push(isAuto ? "VIDEO_PROVIDER_AUTO_QUALITY_CONFIGURATION_REQUIRED" : `VIDEO_QUALITY_NOT_CONFIGURED:${selection || "missing"}`);
  }
  if (definition && profile.supported_resolutions.length && !profile.supported_resolutions.includes(definition.id)) {
    reasons.push(`VIDEO_QUALITY_UNSUPPORTED:${definition.id}`);
  }
  if (definition) {
    const durations = allowedDurations(resolutionConstraint(profile, definition.id));
    if (durations.length && (!Number.isFinite(duration) || !durations.includes(duration))) {
      reasons.push(`VIDEO_PROVIDER_RESOLUTION_DURATION_UNSUPPORTED:${definition.id}:${Number.isFinite(duration) ? duration : "missing"}`);
    }
  }
  if (profile.supported_aspect_ratios.length && !profile.supported_aspect_ratios.includes(text(aspect_ratio))) {
    reasons.push(`VIDEO_PROVIDER_ASPECT_RATIO_UNSUPPORTED:${aspect_ratio}`);
  }

  return {
    contract: "CREATIVE_VIDEO_EXECUTION_QUALITY_V3",
    requested_preference: selection,
    resolved_preference: definition?.id || null,
    resolution: definition?.id || null,
    label: definition?.label || null,
    short_label: definition?.short_label || null,
    aspect_ratio: text(aspect_ratio) || null,
    dimensions: definition ? dimensionsForOption(definition, aspect_ratio) : null,
    supported_resolutions: profile.supported_resolutions,
    provider_native_frame_rate: Number.isFinite(Number(profile.native_frame_rate)) ? Number(profile.native_frame_rate) : null,
    native_audio: typeof profile.native_audio === "boolean" ? profile.native_audio : null,
    provider,
    model,
    duration_seconds: Number.isFinite(duration) ? duration : null,
    ready: reasons.length === 0,
    reasons,
  };
}

export const CreativeVideoQualityPreferenceRuntime = Object.freeze({
  contract: CREATIVE_VIDEO_QUALITY_CONTRACT,
  normalize: normalizeCreativeVideoQuality,
  capabilityProfile: creativeVideoCapabilityProfile,
  definition: creativeVideoQualityDefinition,
  fromProject: creativeVideoQualityFromProject,
  dimensions: creativeVideoQualityDimensions,
  createPreference: createCreativeVideoQualityPreference,
  resolveExecution: resolveCreativeVideoExecutionQuality,
});
