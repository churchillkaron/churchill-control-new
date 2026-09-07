import crypto from "node:crypto";

const CONTRACT = "AVANTIQO_MULTI_VERSION_AUDIENCE_OUTPUT_V1";
const VERSION_CONTRACT = "AVANTIQO_AUDIENCE_VERSION_V1";

function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function text(value) { return String(value ?? "").trim(); }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).filter((key) => key !== "version_hash" && key !== "matrix_hash").sort().map((key) => [key, canonical(value[key])]));
}
function digest(value) { return crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex"); }
function normalizeChannel(value) { return text(value).toUpperCase().replace(/[^A-Z0-9]+/g, "_"); }

function requestedVersions(input = {}) {
  const plan = object(input.creative_plan);
  const requested = list(input.requestedOutputs || input.requested_outputs);
  const deliverables = list(plan.deliverables);
  const values = [];
  for (const item of requested) {
    if (typeof item === "string") values.push({ id: item, channel: item });
    else values.push(item);
  }
  for (const deliverable of deliverables) {
    const channels = list(deliverable.channels);
    if (!channels.length) values.push({
      id: deliverable.id || deliverable.type || "MASTER",
      channel: "MASTER",
      purpose: deliverable.purpose || null,
      output_spec: deliverable.output_spec || {},
    });
    for (const channel of channels) values.push({
      id: `${deliverable.id || "deliverable"}:${channel}`,
      channel,
      purpose: deliverable.purpose || null,
      output_spec: deliverable.output_spec || {},
    });
  }
  if (!values.length) values.push({ id: "MASTER", channel: "MASTER" });
  const seen = new Set();
  return values.filter((entry) => {
    const key = `${normalizeChannel(entry.channel || entry.id)}:${text(entry.purpose)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function channelDefaults(channel) {
  const name = normalizeChannel(channel);
  if (/TIKTOK|REELS|SHORTS|STORY|VERTICAL/.test(name)) {
    return { aspect_ratio: "9:16", framing_mode: "VERTICAL_REFRAme_REQUIRED", safe_area: "CENTER_WEIGHTED_MOBILE" };
  }
  if (/FEED_SQUARE|SQUARE/.test(name)) {
    return { aspect_ratio: "1:1", framing_mode: "SQUARE_REFRAME_REQUIRED", safe_area: "CENTER_WEIGHTED_FEED" };
  }
  if (/YOUTUBE|WEB|TV|LANDSCAPE|MASTER/.test(name)) {
    return { aspect_ratio: "16:9", framing_mode: "LANDSCAPE_OR_MASTER", safe_area: "TITLE_SAFE" };
  }
  return { aspect_ratio: null, framing_mode: "EXPLICIT_PROFILE_REQUIRED", safe_area: "PROFILE_DEFINED" };
}

function buildVersion(entry, index, plan) {
  const channel = normalizeChannel(entry.channel || entry.id || `VERSION_${index + 1}`);
  const defaults = channelDefaults(channel);
  const spec = object(entry.output_spec || entry.outputSpec);
  const aspectRatio = text(spec.aspect_ratio || spec.aspectRatio || defaults.aspect_ratio) || null;
  const purpose = text(entry.purpose || entry.use_case || entry.useCase || plan.concept?.message) || "Preserve the approved master intent for this delivery context.";
  const version = {
    contract: VERSION_CONTRACT,
    version_id: text(entry.id) || `version-${String(index + 1).padStart(2, "0")}`,
    channel,
    purpose,
    audience: object(entry.audience || entry.target_audience || plan.concept?.target_audience),
    output_spec: {
      ...spec,
      aspect_ratio: aspectRatio,
    },
    adaptation: {
      framing_mode: defaults.framing_mode,
      safe_area: defaults.safe_area,
      narrative_reordering_allowed: entry.allow_narrative_reordering === true,
      duration_change_allowed: entry.allow_duration_change === true,
      copy_change_allowed: entry.allow_copy_change === true,
      audio_mix_change_allowed: entry.allow_audio_mix_change !== false,
    },
    invariants: {
      creative_thesis_hash: digest(plan.concept?.creative_thesis || ""),
      story_hash: digest(plan.story || {}),
      identity_continuity_must_survive: true,
      world_continuity_must_survive: true,
      factual_claims_must_not_change: true,
      brand_fidelity_must_survive: true,
      protected_style_imitation_forbidden: true,
    },
    creative_reframe_required: Boolean(aspectRatio && aspectRatio !== text(plan.deliverables?.[0]?.output_spec?.aspect_ratio)),
    derivative_must_not_be_stretched_or_blind_cropped: true,
    publication_authorized: false,
    provider_calls_executed: 0,
  };
  return { ...version, version_hash: digest(version) };
}

export const CreativeAudienceVersioningRuntime = Object.freeze({
  contract: CONTRACT,
  version_contract: VERSION_CONTRACT,
  publication_authorized: false,
  provider_calls_executed: 0,

  build(input = {}) {
    const plan = object(input.creative_plan);
    if (text(plan.workflow_kind).toUpperCase() !== "TEMPORAL") {
      return { ...input, audience_versioning: { contract: CONTRACT, applicable: false } };
    }
    if (!text(plan.concept?.creative_thesis)) throw new Error("AUDIENCE_VERSIONING_CREATIVE_THESIS_REQUIRED");
    if (!Object.keys(object(plan.story)).length) throw new Error("AUDIENCE_VERSIONING_STORY_REQUIRED");
    const requested = requestedVersions(input);
    const versions = requested.map((entry, index) => buildVersion(entry, index, plan));
    const matrix = {
      contract: CONTRACT,
      applicable: true,
      version_count: versions.length,
      versions,
      source_of_truth: "APPROVED_MASTER_CREATIVE_INTENT",
      master_story_may_not_be_silently_rewritten: true,
      creative_reframe_required_for_aspect_ratio_change: true,
      blind_crop_or_stretch_forbidden: true,
      every_version_requires_same_quality_and_continuity_gates: true,
      publication_requires_existing_release_authority: true,
      publication_authorized: false,
      provider_calls_executed: 0,
    };
    matrix.matrix_hash = digest(matrix);
    return {
      ...input,
      creative_plan: {
        ...plan,
        audience_versioning: matrix,
      },
      audience_versioning: matrix,
    };
  },

  hash: digest,
});

export const AVANTIQO_MULTI_VERSION_AUDIENCE_OUTPUT_CONTRACT = CONTRACT;
