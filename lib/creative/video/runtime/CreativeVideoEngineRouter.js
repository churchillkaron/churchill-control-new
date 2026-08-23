const CONTRACT = "CREATIVE_VIDEO_EXECUTION_ROUTE_V3";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function lower(value) {
  return text(value).toLowerCase();
}

function resolutionHeight(value) {
  const source = lower(value);
  if (!source) return null;
  if (source.includes("4k")) return 2160;
  if (source.includes("1080")) return 1080;
  if (source.includes("720")) return 720;
  const match = source.match(/(\d{3,4})p/);
  return match ? Number(match[1]) : null;
}

function sourceAvailable(bible = {}) {
  return Boolean(
    text(bible.source?.primary_source_asset_id) ||
    (Array.isArray(bible.source?.reference_asset_ids) &&
      bible.source.reference_asset_ids.length),
  );
}

function durationFor(bible = {}) {
  return finite(bible.output?.duration_seconds);
}

function precisionRequirements(bible = {}) {
  const precision = object(bible.precision_control);
  return {
    exact_last_frame_required: precision.exact_last_frame_required === true,
    video_extension_required: precision.video_extension_required === true,
    multi_reference_control_required:
      precision.multi_reference_control_required === true,
  };
}

function routeEvidence(bible = {}, capability = null) {
  const precision = precisionRequirements(bible);
  const resolution = bible.output?.resolution || null;
  return {
    capability,
    duration_seconds: durationFor(bible),
    resolution,
    resolution_height: resolutionHeight(resolution),
    has_source_visual: sourceAvailable(bible),
    identity_required: bible.quality?.identity_required === true,
    product_fidelity_required:
      bible.quality?.product_fidelity_required === true,
    continuity_required: bible.quality?.continuity_required === true,
    hard_precision_required: Object.values(precision).some(Boolean),
    ...precision,
  };
}

function serviceRuntimePolicy(evidence = {}) {
  return {
    selection_weights: {
      quality: 5,
      reliability: 4,
      speed: 2,
      cost: 1,
    },
    video_requirements: {
      capability: evidence.capability || null,
      duration_seconds: evidence.duration_seconds,
      resolution: evidence.resolution,
      resolution_height: evidence.resolution_height,
      has_source_visual: evidence.has_source_visual === true,
      identity_required: evidence.identity_required === true,
      product_fidelity_required: evidence.product_fidelity_required === true,
      continuity_required: evidence.continuity_required === true,
      exact_last_frame_required: evidence.exact_last_frame_required === true,
      video_extension_required: evidence.video_extension_required === true,
      multi_reference_control_required:
        evidence.multi_reference_control_required === true,
    },
    provider_selection_boundary: "SERVICE_RUNTIME_ONLY",
    owned_first_required: true,
    external_fallback_allowed: true,
    creative_provider_selection_forbidden: true,
  };
}

function videoCapability(value) {
  const capability = lower(value);
  if (!capability.startsWith("ai.video.")) {
    throw new Error(`CREATIVE_VIDEO_CAPABILITY_REQUIRED:${capability || "MISSING"}`);
  }
  return capability;
}

export function resolveCreativeVideoEngine({
  shot_bible = {},
  capability = "ai.video.generate",
} = {}) {
  if (shot_bible.contract !== "CREATIVE_SHOT_BIBLE_V1") {
    throw new Error("CREATIVE_VIDEO_ENGINE_SHOT_BIBLE_REQUIRED");
  }

  const executionCapability = videoCapability(capability);
  const evidence = routeEvidence(shot_bible, executionCapability);

  return {
    contract: CONTRACT,
    status: "ROUTED",
    decision: "SERVICE_RUNTIME_OWNED_FIRST_CAPABILITY_SELECTION",
    execution_capability: executionCapability,
    primary: null,
    challengers: [],
    provider_policy: serviceRuntimePolicy(evidence),
    evidence: {
      ...evidence,
      provider_selected_by_creative: false,
      provider_model_selected_by_creative: false,
      service_runtime_owned_first_required: true,
      external_provider_role: "SUPPLEMENTAL_OR_FALLBACK_ONLY",
      capability_certification_remains_mandatory: true,
    },
    fail_closed: true,
    paid_execution_authorized: false,
  };
}

export function assertCreativeVideoEngineRoute(route = {}) {
  if (route.contract !== CONTRACT) {
    throw new Error("CREATIVE_VIDEO_ENGINE_ROUTE_CONTRACT_REQUIRED");
  }
  if (route.status === "BLOCKED") {
    throw new Error(`CREATIVE_VIDEO_ENGINE_ROUTE_BLOCKED:${route.decision}`);
  }
  if (!text(route.execution_capability).startsWith("ai.video.")) {
    throw new Error("CREATIVE_VIDEO_EXECUTION_CAPABILITY_REQUIRED");
  }
  if (!route.provider_policy) {
    throw new Error("CREATIVE_VIDEO_ENGINE_PROVIDER_POLICY_REQUIRED");
  }
  if (
    route.primary ||
    route.provider_policy.allowed_providers ||
    route.provider_policy.allowedProviders ||
    route.provider_policy.preferred_providers ||
    route.provider_policy.preferredProviders ||
    route.provider_policy.preferred_models ||
    route.provider_policy.preferredModels
  ) {
    throw new Error("CREATIVE_VIDEO_PROVIDER_SELECTION_FORBIDDEN");
  }
  return route;
}

export const CreativeVideoEngineRouter = Object.freeze({
  contract: CONTRACT,
  resolve: resolveCreativeVideoEngine,
  assert: assertCreativeVideoEngineRoute,
});
