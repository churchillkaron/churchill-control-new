const CONTRACT = "CREATIVE_VIDEO_ENGINE_ROUTE_V1";

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

function modelForImageMode(provider, hasSource) {
  if (provider === "gemini") return "gemini-omni-flash-preview";
  if (provider === "veo") {
    return hasSource
      ? "fal-ai/veo3.1/fast/image-to-video"
      : "fal-ai/veo3.1/fast";
  }
  if (provider === "seedance") {
    return hasSource
      ? "bytedance/seedance-2.0/fast/image-to-video"
      : "bytedance/seedance-2.0/fast/text-to-video";
  }
  return null;
}

function precisionRequirement(bible = {}) {
  const precision = object(bible.precision_control);
  return Boolean(
    precision.exact_last_frame_required ||
    precision.video_extension_required ||
    precision.multi_reference_control_required,
  );
}

function routeEvidence(bible = {}) {
  return {
    duration_seconds: durationFor(bible),
    resolution: bible.output?.resolution || null,
    has_source_visual: sourceAvailable(bible),
    identity_required: bible.quality?.identity_required === true,
    product_fidelity_required:
      bible.quality?.product_fidelity_required === true,
    continuity_required: bible.quality?.continuity_required === true,
    hard_precision_required: precisionRequirement(bible),
    exact_last_frame_required:
      bible.precision_control?.exact_last_frame_required === true,
    video_extension_required:
      bible.precision_control?.video_extension_required === true,
    multi_reference_control_required:
      bible.precision_control?.multi_reference_control_required === true,
  };
}

function policy(preferredProviders, preferredModels, allowedProviders = null) {
  return {
    ...(allowedProviders?.length
      ? { allowed_providers: allowedProviders }
      : {}),
    preferred_providers: preferredProviders,
    preferred_models: preferredModels.filter(Boolean),
    selection_weights: {
      preference: 8,
      quality: 5,
      reliability: 4,
      speed: 2,
      cost: 1,
    },
  };
}

export function resolveCreativeVideoEngine({ shot_bible = {} } = {}) {
  if (shot_bible.contract !== "CREATIVE_SHOT_BIBLE_V1") {
    throw new Error("CREATIVE_VIDEO_ENGINE_SHOT_BIBLE_REQUIRED");
  }

  const evidence = routeEvidence(shot_bible);
  const duration = evidence.duration_seconds;
  const hasSource = evidence.has_source_visual;
  const height = resolutionHeight(evidence.resolution);

  if (evidence.hard_precision_required) {
    return {
      contract: CONTRACT,
      status: "BLOCKED",
      decision: "DIRECT_VEO_PRECISION_RUNTIME_REQUIRED",
      reason:
        "This shot requires exact last-frame, extension or multi-reference controls that are not guaranteed by the current executable Gemini Omni / Veo Fast via FAL / Seedance / Runway pool.",
      provider_policy: null,
      evidence,
      fail_closed: true,
      paid_execution_authorized: false,
    };
  }

  if (duration !== null && duration > 10 && duration <= 15) {
    const provider = "seedance";
    return {
      contract: CONTRACT,
      status: "ROUTED",
      decision: "LONGER_CONTINUOUS_MOTION",
      primary: {
        provider,
        model: modelForImageMode(provider, hasSource),
      },
      challengers: ["veo", "runway", "gemini"],
      provider_policy: policy(
        ["seedance", "veo", "runway", "gemini"],
        [modelForImageMode("seedance", hasSource)],
      ),
      evidence,
      paid_execution_authorized: false,
    };
  }

  if (height !== null && height > 720) {
    const provider = "veo";
    return {
      contract: CONTRACT,
      status: "ROUTED",
      decision: "HIGH_FIDELITY_CANDIDATE_WITH_FINISHING_VALIDATION",
      primary: {
        provider,
        model: modelForImageMode(provider, hasSource),
      },
      challengers: ["gemini", "seedance", "runway"],
      provider_policy: policy(
        ["veo", "gemini", "seedance", "runway"],
        [
          modelForImageMode("veo", hasSource),
          modelForImageMode("gemini", hasSource),
        ],
      ),
      evidence: {
        ...evidence,
        note:
          "Requested resolution exceeds Gemini Omni's native 720p output; provider output remains subject to actual priced model capability and deterministic finishing/upscaling requirements.",
      },
      paid_execution_authorized: false,
    };
  }

  const provider = "gemini";
  return {
    contract: CONTRACT,
    status: "ROUTED",
    decision: hasSource
      ? "DEFAULT_MULTIMODAL_CONTINUITY"
      : "DEFAULT_WORLD_BUILDING",
    primary: {
      provider,
      model: modelForImageMode(provider, hasSource),
    },
    challengers: ["veo", "seedance", "runway"],
    provider_policy: policy(
      ["gemini", "veo", "seedance", "runway"],
      [
        modelForImageMode("gemini", hasSource),
        modelForImageMode("veo", hasSource),
        modelForImageMode("seedance", hasSource),
      ],
    ),
    evidence,
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
  if (!route.provider_policy) {
    throw new Error("CREATIVE_VIDEO_ENGINE_PROVIDER_POLICY_REQUIRED");
  }
  return route;
}

export const CreativeVideoEngineRouter = Object.freeze({
  contract: CONTRACT,
  resolve: resolveCreativeVideoEngine,
  assert: assertCreativeVideoEngineRoute,
});
