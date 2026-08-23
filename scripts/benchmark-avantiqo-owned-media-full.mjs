import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CONTRACT = "AVANTIQO_OWNED_MEDIA_FULL_CAPABILITY_BENCHMARK_V1";
const RUNPOD_API_BASE = "https://api.runpod.ai/v2";
const OUTPUT = resolve(
  process.env.AVANTIQO_MEDIA_FULL_BENCHMARK_OUTPUT ||
    "/tmp/avantiqo-owned-media-full-capability-benchmark.json",
);
const FIXTURES_PATH = resolve(
  process.env.AVANTIQO_MEDIA_CERTIFICATION_FIXTURES ||
    "/tmp/avantiqo-media-certification-fixtures.json",
);

const IMAGE_CAPABILITIES = Object.freeze([
  "ai.image.generate",
  "ai.image.edit",
  "ai.image.inpaint",
  "ai.image.outpaint",
  "ai.image.upscale",
  "ai.image.analyze",
]);
const CINEMA_CAPABILITIES = Object.freeze([
  "ai.video.generate",
  "ai.video.image_to_video",
  "ai.video.first_last_frame_to_video",
  "ai.video.video_to_video",
  "ai.video.edit",
  "ai.video.inpaint",
  "ai.video.extend",
  "ai.video.upscale",
  "ai.video.lipsync",
]);
const ECONOMICS_RATE_ENV = Object.freeze({
  image: "AVANTIQO_IMAGE_GPU_USD_PER_SECOND",
  cinema: "AVANTIQO_VIDEO_GPU_USD_PER_SECOND",
  lipsync: "AVANTIQO_LIPSYNC_GPU_USD_PER_SECOND",
});

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function requireValue(value, name) {
  const normalized = text(value);
  if (!normalized) throw new Error(`MEDIA_CERTIFICATION_FIXTURE_REQUIRED:${name}`);
  return normalized;
}

function assertHttps(value, name) {
  const normalized = requireValue(value, name);
  const parsed = new URL(normalized);
  if (parsed.protocol !== "https:") {
    throw new Error(`MEDIA_CERTIFICATION_HTTPS_REQUIRED:${name}`);
  }
  return normalized;
}

function uploadFor(fixtures, capability) {
  const upload = object(object(fixtures.uploads)[capability]);
  return {
    signed_url: assertHttps(upload.signed_url, `uploads.${capability}.signed_url`),
    storage_reference: requireValue(
      upload.storage_reference,
      `uploads.${capability}.storage_reference`,
    ),
  };
}

function economicsRate(capability) {
  const family = capability === "ai.video.lipsync"
    ? "lipsync"
    : capability.startsWith("ai.image.")
      ? "image"
      : "cinema";
  const envName = ECONOMICS_RATE_ENV[family];
  const value = Number(process.env[envName]);
  return {
    family,
    env_name: envName,
    configured: Number.isFinite(value) && value > 0,
    usd_per_second: Number.isFinite(value) && value > 0 ? value : null,
  };
}

function economicsEvidence(capability, wallMs) {
  const rate = economicsRate(capability);
  const observedSeconds = Number.isFinite(wallMs) && wallMs > 0
    ? wallMs / 1000
    : null;
  return {
    rate_env_name: rate.env_name,
    rate_configured: rate.configured,
    usd_per_second: rate.usd_per_second,
    observed_seconds: observedSeconds,
    measurement_basis: "RUNPOD_RUNSYNC_WALL_TIME_CONSERVATIVE",
    estimated_supplier_compute_cost_usd:
      rate.configured && observedSeconds !== null
        ? Number((rate.usd_per_second * observedSeconds).toFixed(6))
        : null,
    economics_certified: false,
  };
}

async function runSync(endpointId, input, timeoutMs = 15 * 60 * 1000) {
  const apiKey = requireValue(process.env.RUNPOD_API_KEY, "RUNPOD_API_KEY");
  const started = performance.now();
  const response = await fetch(`${RUNPOD_API_BASE}/${endpointId}/runsync`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ input }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json().catch(() => ({}));
  const wallMs = Math.round(performance.now() - started);
  if (!response.ok) {
    throw new Error(`RUNPOD_HTTP_${response.status}:${text(body?.error || body?.message)}`);
  }
  if (text(body?.status).toUpperCase() !== "COMPLETED") {
    throw new Error(`RUNPOD_NOT_COMPLETED:${text(body?.status) || "UNKNOWN"}`);
  }
  return { body, output: object(body.output), wall_ms: wallMs };
}

function imageBase(capability, instruction) {
  return {
    contract: "AVANTIQO_IMAGE_ENGINE_V1",
    capability,
    certification_execution: true,
    organization_id: "benchmark-only",
    usage_id: `benchmark-${capability.replaceAll(".", "-")}`,
    instruction,
    structured_specification: {
      output_spec: { aspect_ratio: "1:1" },
      provider_parameters: { seed: 71001, inference_steps: 28 },
    },
  };
}

function cinemaBase(capability, instruction) {
  return {
    contract: "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1",
    capability,
    certification_execution: true,
    organization_id: "benchmark-only",
    usage_id: `benchmark-${capability.replaceAll(".", "-")}`,
    instruction,
    duration_seconds: 2,
    fps: 16,
    aspect_ratio: "16:9",
    resolution: "720p",
    seed: 72001,
    cinematic_control: {
      contract: "AVANTIQO_CINEMATIC_CONTROL_V1",
      continuity: {
        benchmark_contract: CONTRACT,
        preserve_source_identity: true,
        preserve_source_geometry: true,
      },
      camera: {},
      frame_contract: {},
      shot_specification: {},
      identity_lock: {},
      negative_constraints: ["no text", "no logo", "no temporal artifacts"],
    },
  };
}

function mechanicalPass(capability, output) {
  if (text(output.capability) !== capability) return false;
  if (output.raw_reasoning_persisted !== false) return false;
  if (capability === "ai.image.analyze") {
    return output.structured_visual_evidence === true &&
      Object.keys(object(output.result)).length > 0;
  }
  return text(output.storage_reference).startsWith("storage://creative-assets/") &&
    Number(output.size_bytes) > 10000;
}

async function benchmarkCase({ engine, capability, endpointId, input }) {
  try {
    const execution = await runSync(endpointId, input);
    return {
      engine,
      capability,
      attempted: true,
      mechanical_passed: mechanicalPass(capability, execution.output),
      wall_ms: execution.wall_ms,
      worker_seconds: Number(execution.output.generation_seconds) || null,
      foundation_model: text(execution.output.foundation_model) || null,
      storage_reference: text(execution.output.storage_reference) || null,
      output: execution.output,
      economics: economicsEvidence(capability, execution.wall_ms),
      human_visual_quality_review_required: true,
      economics_review_required: true,
      production_certified: false,
    };
  } catch (error) {
    return {
      engine,
      capability,
      attempted: true,
      mechanical_passed: false,
      error: text(error?.message || error).slice(0, 1500),
      economics: economicsEvidence(capability, null),
      human_visual_quality_review_required: true,
      economics_review_required: true,
      production_certified: false,
    };
  }
}

const fixtures = JSON.parse(await readFile(FIXTURES_PATH, "utf8"));
const imageEndpoint = requireValue(
  process.env.RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID,
  "RUNPOD_AVANTIQO_IMAGE_ENDPOINT_ID",
);
const cinemaEndpoint = requireValue(
  process.env.RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID,
  "RUNPOD_AVANTIQO_VIDEO_ENDPOINT_ID",
);
const lipsyncEndpoint = requireValue(
  process.env.RUNPOD_AVANTIQO_LIPSYNC_ENDPOINT_ID,
  "RUNPOD_AVANTIQO_LIPSYNC_ENDPOINT_ID",
);

const imageSource = assertHttps(fixtures.image_source_url, "image_source_url");
const imageMask = assertHttps(fixtures.image_mask_url, "image_mask_url");
const firstFrame = assertHttps(fixtures.video_first_frame_url || fixtures.image_source_url, "video_first_frame_url");
const lastFrame = assertHttps(fixtures.video_last_frame_url, "video_last_frame_url");
const videoSource = assertHttps(fixtures.video_source_url, "video_source_url");
const videoMask = assertHttps(fixtures.video_mask_url, "video_mask_url");
const lipsyncVideoSource = assertHttps(
  fixtures.lipsync_video_source_url,
  "lipsync_video_source_url",
);
const audioSource = assertHttps(fixtures.audio_source_url, "audio_source_url");

const cases = [
  {
    engine: "image",
    capability: "ai.image.generate",
    endpointId: imageEndpoint,
    input: {
      ...imageBase("ai.image.generate", "Generate a premium photorealistic black glass product on a neutral studio surface, no text, no logo."),
      storage_upload: uploadFor(fixtures, "ai.image.generate"),
    },
  },
  {
    engine: "image",
    capability: "ai.image.edit",
    endpointId: imageEndpoint,
    input: {
      ...imageBase("ai.image.edit", "Make one controlled material change while preserving composition, identity, geometry and camera."),
      source_asset_roles: { source_image: imageSource },
      source_assets: [imageSource],
      storage_upload: uploadFor(fixtures, "ai.image.edit"),
    },
  },
  {
    engine: "image",
    capability: "ai.image.inpaint",
    endpointId: imageEndpoint,
    input: {
      ...imageBase("ai.image.inpaint", "Replace only the masked region with a coherent photorealistic detail; preserve every unmasked pixel."),
      source_asset_roles: { source_image: imageSource, mask_image: imageMask },
      source_assets: [imageSource, imageMask],
      storage_upload: uploadFor(fixtures, "ai.image.inpaint"),
    },
  },
  {
    engine: "image",
    capability: "ai.image.outpaint",
    endpointId: imageEndpoint,
    input: {
      ...imageBase("ai.image.outpaint", "Extend the scene naturally while preserving the original image region exactly."),
      source_asset_roles: { source_image: imageSource },
      source_assets: [imageSource],
      structured_specification: {
        output_spec: { aspect_ratio: "16:9" },
        provider_parameters: { seed: 71004, inference_steps: 28 },
      },
      storage_upload: uploadFor(fixtures, "ai.image.outpaint"),
    },
  },
  {
    engine: "image",
    capability: "ai.image.upscale",
    endpointId: imageEndpoint,
    input: {
      ...imageBase("ai.image.upscale", "Increase real detail and clarity without changing identity, composition, colors or geometry."),
      source_asset_roles: { source_image: imageSource },
      source_assets: [imageSource],
      storage_upload: uploadFor(fixtures, "ai.image.upscale"),
    },
  },
  {
    engine: "image",
    capability: "ai.image.analyze",
    endpointId: imageEndpoint,
    input: {
      ...imageBase("ai.image.analyze", "Return strict JSON with keys: description, visible_artifacts, composition_score, realism_score, identity_risk, release_recommendation."),
      source_asset_roles: { source_image: imageSource },
      source_assets: [imageSource],
    },
  },
  {
    engine: "cinema",
    capability: "ai.video.generate",
    endpointId: cinemaEndpoint,
    input: {
      ...cinemaBase("ai.video.generate", "Cinematic slow dolly through a refined dark architectural space with physically realistic materials."),
      storage_upload: uploadFor(fixtures, "ai.video.generate"),
    },
  },
  {
    engine: "cinema",
    capability: "ai.video.image_to_video",
    endpointId: cinemaEndpoint,
    input: {
      ...cinemaBase("ai.video.image_to_video", "Preserve the reference composition and identity while adding subtle physically plausible cinematic motion."),
      reference_images: [firstFrame],
      storage_upload: uploadFor(fixtures, "ai.video.image_to_video"),
    },
  },
  {
    engine: "cinema",
    capability: "ai.video.first_last_frame_to_video",
    endpointId: cinemaEndpoint,
    input: {
      ...cinemaBase("ai.video.first_last_frame_to_video", "Create a coherent cinematic transition from the governed opening frame to the governed closing frame."),
      first_frame: firstFrame,
      last_frame: lastFrame,
      storage_upload: uploadFor(fixtures, "ai.video.first_last_frame_to_video"),
    },
  },
  {
    engine: "cinema",
    capability: "ai.video.video_to_video",
    endpointId: cinemaEndpoint,
    input: {
      ...cinemaBase("ai.video.video_to_video", "Transform the visual treatment while preserving source timing, geometry, motion and identity."),
      source_video: videoSource,
      storage_upload: uploadFor(fixtures, "ai.video.video_to_video"),
    },
  },
  {
    engine: "cinema",
    capability: "ai.video.edit",
    endpointId: cinemaEndpoint,
    input: {
      ...cinemaBase("ai.video.edit", "Apply a controlled cinematic visual edit while preserving timing, identity, motion and source geometry."),
      source_video: videoSource,
      storage_upload: uploadFor(fixtures, "ai.video.edit"),
    },
  },
  {
    engine: "cinema",
    capability: "ai.video.inpaint",
    endpointId: cinemaEndpoint,
    input: {
      ...cinemaBase("ai.video.inpaint", "Regenerate only the masked moving region while preserving every unmasked source region and temporal continuity."),
      source_video: videoSource,
      mask_video: videoMask,
      storage_upload: uploadFor(fixtures, "ai.video.inpaint"),
    },
  },
  {
    engine: "cinema",
    capability: "ai.video.extend",
    endpointId: cinemaEndpoint,
    input: {
      ...cinemaBase("ai.video.extend", "Continue naturally from the exact source tail with consistent identity, camera, physics, lighting and spatial direction."),
      source_video: videoSource,
      storage_upload: uploadFor(fixtures, "ai.video.extend"),
    },
  },
  {
    engine: "cinema",
    capability: "ai.video.upscale",
    endpointId: cinemaEndpoint,
    input: {
      ...cinemaBase("ai.video.upscale", "Increase delivery detail while preserving source identity, colors, geometry, timing and motion."),
      source_video: videoSource,
      storage_upload: uploadFor(fixtures, "ai.video.upscale"),
    },
  },
  {
    engine: "cinema",
    capability: "ai.video.lipsync",
    endpointId: lipsyncEndpoint,
    input: {
      ...cinemaBase("ai.video.lipsync", "Synchronize visible speech articulation to the supplied governed audio while preserving facial identity and all non-mouth visual detail."),
      source_video: lipsyncVideoSource,
      source_audio: audioSource,
      source_asset_roles: {
        source_video: lipsyncVideoSource,
        source_audio: audioSource,
      },
      storage_upload: uploadFor(fixtures, "ai.video.lipsync"),
    },
  },
];

const results = [];
for (const benchmark of cases) {
  console.log(`BENCHMARK ${benchmark.capability}`);
  results.push(await benchmarkCase(benchmark));
}

const measured = results.filter((item) => item.attempted).map((item) => item.capability);
const mechanicalPassed = results.filter((item) => item.mechanical_passed).map((item) => item.capability);
const failed = results.filter((item) => !item.mechanical_passed).map((item) => item.capability);
const allCapabilities = [...IMAGE_CAPABILITIES, ...CINEMA_CAPABILITIES];
const fullCoverage = allCapabilities.every((capability) => measured.includes(capability));
const allMechanicalPassed = fullCoverage && failed.length === 0;
const economicsMissingRateCapabilities = results
  .filter((item) => item.economics?.rate_configured !== true)
  .map((item) => item.capability);
const economicsMeasuredCapabilities = results
  .filter((item) => Number.isFinite(item.economics?.estimated_supplier_compute_cost_usd))
  .map((item) => item.capability);
const economicsEvidenceComplete =
  economicsMissingRateCapabilities.length === 0 &&
  economicsMeasuredCapabilities.length === allCapabilities.length;
const estimatedSupplierComputeCostUsd = results.reduce(
  (total, item) => total + Number(item.economics?.estimated_supplier_compute_cost_usd || 0),
  0,
);

const report = {
  contract: CONTRACT,
  generated_at: new Date().toISOString(),
  fixture_path: FIXTURES_PATH,
  source_scope: "BENCHMARK_ONLY",
  certification_execution: true,
  image_capabilities: IMAGE_CAPABILITIES,
  cinema_capabilities: CINEMA_CAPABILITIES,
  measured_capabilities: measured,
  mechanically_passed_capabilities: mechanicalPassed,
  failed_capabilities: failed,
  full_capability_coverage: fullCoverage,
  all_mechanical_checks_passed: allMechanicalPassed,
  economics: {
    evidence_complete: economicsEvidenceComplete,
    measured_capabilities: economicsMeasuredCapabilities,
    missing_rate_capabilities: economicsMissingRateCapabilities,
    required_rate_env_names: Object.values(ECONOMICS_RATE_ENV),
    estimated_supplier_compute_cost_usd: Number(estimatedSupplierComputeCostUsd.toFixed(6)),
    measurement_basis: "RUNPOD_RUNSYNC_WALL_TIME_CONSERVATIVE",
    economics_certified: false,
  },
  ready_for_human_quality_review:
    allMechanicalPassed && economicsEvidenceComplete,
  activation_allowed: false,
  pricing_activation_performed: false,
  human_visual_quality_review_required: true,
  measured_gpu_economics_required: true,
  final_production_certification_required: true,
  cases: results,
  summary: {
    capabilities_expected: allCapabilities.length,
    capabilities_measured: measured.length,
    capabilities_mechanically_passed: mechanicalPassed.length,
    capabilities_failed: failed.length,
    full_capability_coverage: fullCoverage,
    all_mechanical_checks_passed: allMechanicalPassed,
    economics_evidence_complete: economicsEvidenceComplete,
    economics_missing_rate_capabilities: economicsMissingRateCapabilities.length,
    ready_for_human_quality_review:
      allMechanicalPassed && economicsEvidenceComplete,
    production_certified: 0,
  },
  certification_rule: {
    mechanical_benchmark_is_not_production_certification: true,
    economics_estimate_is_not_production_certification: true,
    human_visual_review_required: true,
    identity_review_required_for_identity_sensitive_video: true,
    temporal_review_required_for_video: true,
    lip_sync_quality_review_required: true,
    endpoint_fidelity_review_required_for_first_last_video: true,
    measured_gpu_economics_required: true,
    pricing_status_required: "PRODUCTION_CERTIFIED",
    automatic_activation_forbidden: true,
  },
};

await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  success: allMechanicalPassed,
  output_path: OUTPUT,
  summary: report.summary,
  activation_allowed: false,
}, null, 2));

if (!allMechanicalPassed) process.exitCode = 1;
