import { createHash } from "node:crypto";
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
const ALL_CAPABILITIES = Object.freeze([
  ...IMAGE_CAPABILITIES,
  ...CINEMA_CAPABILITIES,
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

function list(value) {
  return Array.isArray(value) ? value : [];
}

function enabled(value) {
  return ["1", "true", "yes", "on"].includes(text(value).toLowerCase());
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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
  return { output: object(body.output), wall_ms: wallMs };
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

function fixtureProvenance(fixtures, capability) {
  const outputUpload = object(object(fixtures.uploads)[capability]);
  const base = {
    contract: text(fixtures.contract),
    generated_at: text(fixtures.generated_at) || null,
    prefix: text(fixtures.prefix) || null,
    source_storage_references: object(fixtures.source_storage_references),
    output_storage_reference: text(outputUpload.storage_reference) || null,
  };
  return {
    ...base,
    fingerprint_sha256: sha256(JSON.stringify(base)),
  };
}

function benchmarkDefinition(benchmark) {
  const input = object(benchmark.input);
  const roles = object(input.source_asset_roles);
  return {
    engine: benchmark.engine,
    capability: benchmark.capability,
    contract: text(input.contract),
    instruction: text(input.instruction),
    structured_specification: object(input.structured_specification),
    duration_seconds: input.duration_seconds ?? null,
    fps: input.fps ?? null,
    aspect_ratio: input.aspect_ratio ?? null,
    resolution: input.resolution ?? null,
    seed: input.seed ?? null,
    cinematic_control: object(input.cinematic_control),
    source_role_names: Object.keys(roles).sort(),
    source_asset_count: list(input.source_assets).length,
    reference_image_count: list(input.reference_images).length,
    has_first_frame: Boolean(text(input.first_frame)),
    has_last_frame: Boolean(text(input.last_frame)),
    has_source_video: Boolean(text(input.source_video)),
    has_mask_video: Boolean(text(input.mask_video)),
    has_source_audio: Boolean(text(input.source_audio)),
    has_storage_upload: Boolean(object(input.storage_upload).storage_reference),
  };
}

function benchmarkDefinitionFingerprint(benchmark) {
  return sha256(JSON.stringify(benchmarkDefinition(benchmark)));
}

function expectedEngineContract(capability) {
  return capability.startsWith("ai.image.")
    ? "AVANTIQO_IMAGE_ENGINE_V1"
    : "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1";
}

function summarizeAttempt(item) {
  return {
    attempted_at: item.executed_at || null,
    attempt_number: Number(item.attempt_number || 1),
    mechanical_passed: item.mechanical_passed === true,
    wall_ms: Number(item.wall_ms) || null,
    foundation_model: text(item.foundation_model) || null,
    storage_reference: text(item.storage_reference) || null,
    error: text(item.error) || null,
    economics: item.economics || null,
    benchmark_definition_sha256: text(item.benchmark_definition_sha256) || null,
    fixture_provenance: item.fixture_provenance || null,
  };
}

function reusablePriorCase(prior, benchmark) {
  if (!prior || prior.attempted !== true || prior.mechanical_passed !== true) {
    return false;
  }
  if (text(prior.capability) !== benchmark.capability) return false;
  if (text(prior.engine) !== benchmark.engine) return false;
  if (!text(prior.foundation_model)) return false;
  if (
    text(prior.benchmark_definition_sha256) !==
    benchmarkDefinitionFingerprint(benchmark)
  ) {
    return false;
  }

  const provenance = object(prior.fixture_provenance);
  if (
    text(provenance.contract) !== "AVANTIQO_OWNED_MEDIA_CERTIFICATION_FIXTURES_V1" ||
    !text(provenance.prefix) ||
    !text(provenance.fingerprint_sha256)
  ) {
    return false;
  }

  const priorOutput = object(prior.output);
  if (text(priorOutput.capability) !== benchmark.capability) return false;
  if (text(priorOutput.foundation_model) !== text(prior.foundation_model)) return false;
  if (text(priorOutput.engine_contract) !== expectedEngineContract(benchmark.capability)) {
    return false;
  }
  if (priorOutput.certification_execution !== true) return false;
  if (priorOutput.raw_reasoning_persisted !== false) return false;

  if (benchmark.capability === "ai.image.analyze") {
    if (
      priorOutput.structured_visual_evidence !== true ||
      Object.keys(object(priorOutput.result)).length === 0
    ) {
      return false;
    }
  } else {
    const storageReference = text(prior.storage_reference);
    if (!storageReference.startsWith("storage://creative-assets/")) return false;
    if (text(priorOutput.storage_reference) !== storageReference) return false;
    if (text(provenance.output_storage_reference) !== storageReference) return false;
    if (!(Number(priorOutput.size_bytes) > 10000)) return false;
  }

  const rate = economicsRate(benchmark.capability);
  const priorEconomics = object(prior.economics);
  if (!rate.configured || priorEconomics.rate_configured !== true) return false;
  if (Number(priorEconomics.usd_per_second) !== rate.usd_per_second) return false;
  if (!Number.isFinite(Number(priorEconomics.estimated_supplier_compute_cost_usd))) {
    return false;
  }
  return true;
}

async function benchmarkCase(benchmark, fixtures, prior = null) {
  const { engine, capability, endpointId, input } = benchmark;
  const attemptHistory = prior
    ? [...list(prior.attempt_history), summarizeAttempt(prior)]
    : [];
  const common = {
    engine,
    capability,
    attempted: true,
    executed_at: new Date().toISOString(),
    attempt_number: Math.max(1, Number(prior?.attempt_number || 0) + 1),
    attempt_history: attemptHistory,
    resumed_from_previous_report: false,
    benchmark_definition_sha256: benchmarkDefinitionFingerprint(benchmark),
    fixture_provenance: fixtureProvenance(fixtures, capability),
    human_visual_quality_review_required: true,
    economics_review_required: true,
    production_certified: false,
  };

  try {
    const execution = await runSync(endpointId, input);
    return {
      ...common,
      mechanical_passed: mechanicalPass(capability, execution.output),
      wall_ms: execution.wall_ms,
      worker_seconds: Number(execution.output.generation_seconds) || null,
      foundation_model: text(execution.output.foundation_model) || null,
      storage_reference: text(execution.output.storage_reference) || null,
      output: execution.output,
      economics: economicsEvidence(capability, execution.wall_ms),
    };
  } catch (error) {
    return {
      ...common,
      mechanical_passed: false,
      error: text(error?.message || error).slice(0, 1500),
      economics: economicsEvidence(capability, null),
    };
  }
}

async function loadPreviousReport(resumeEnabled) {
  if (!resumeEnabled) return null;
  try {
    const previous = JSON.parse(await readFile(OUTPUT, "utf8"));
    if (previous?.contract !== CONTRACT) {
      throw new Error("AVANTIQO_MEDIA_CERTIFICATION_RESUME_CONTRACT_INVALID");
    }
    if (previous?.source_scope !== "BENCHMARK_ONLY") {
      throw new Error("AVANTIQO_MEDIA_CERTIFICATION_RESUME_SCOPE_INVALID");
    }
    if (previous?.activation_allowed !== false) {
      throw new Error("AVANTIQO_MEDIA_CERTIFICATION_RESUME_ACTIVATION_STATE_INVALID");
    }
    return previous;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function previousCaseMap(previousReport) {
  const map = new Map();
  for (const item of list(previousReport?.cases)) {
    const capability = text(item?.capability);
    if (!ALL_CAPABILITIES.includes(capability)) continue;
    if (map.has(capability)) {
      throw new Error(`AVANTIQO_MEDIA_CERTIFICATION_DUPLICATE_CHECKPOINT_CASE:${capability}`);
    }
    map.set(capability, item);
  }
  return map;
}

function orderedResults(resultsByCapability) {
  return ALL_CAPABILITIES
    .map((capability) => resultsByCapability.get(capability))
    .filter(Boolean);
}

function reportFor(results, fixtures, resume) {
  const measured = results
    .filter((item) => item.attempted)
    .map((item) => item.capability);
  const mechanicalPassed = results
    .filter((item) => item.mechanical_passed)
    .map((item) => item.capability);
  const failed = results
    .filter((item) => !item.mechanical_passed)
    .map((item) => item.capability);
  const missing = ALL_CAPABILITIES.filter((capability) => !measured.includes(capability));
  const fullCoverage = missing.length === 0;
  const allMechanicalPassed = fullCoverage && failed.length === 0;
  const economicsMissingRateCapabilities = results
    .filter((item) => item.economics?.rate_configured !== true)
    .map((item) => item.capability);
  const economicsMeasuredCapabilities = results
    .filter((item) => Number.isFinite(item.economics?.estimated_supplier_compute_cost_usd))
    .map((item) => item.capability);
  const economicsEvidenceComplete =
    fullCoverage &&
    economicsMissingRateCapabilities.length === 0 &&
    economicsMeasuredCapabilities.length === ALL_CAPABILITIES.length;
  const estimatedSupplierComputeCostUsd = results.reduce(
    (total, item) => total + Number(item.economics?.estimated_supplier_compute_cost_usd || 0),
    0,
  );

  return {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    fixture_path: FIXTURES_PATH,
    current_fixture_prefix: text(fixtures.prefix) || null,
    source_scope: "BENCHMARK_ONLY",
    certification_execution: true,
    image_capabilities: IMAGE_CAPABILITIES,
    cinema_capabilities: CINEMA_CAPABILITIES,
    measured_capabilities: measured,
    mechanically_passed_capabilities: mechanicalPassed,
    failed_capabilities: failed,
    missing_capabilities: missing,
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
    resume: {
      enabled: resume.enabled,
      previous_report_loaded: resume.previous_report_loaded,
      previous_report_generated_at: resume.previous_report_generated_at,
      targeted_retry_enabled: resume.targeted_retry_enabled,
      target_capability: resume.target_capability,
      capabilities_reused: [...resume.capabilities_reused],
      capabilities_preserved_without_execution: [
        ...resume.capabilities_preserved_without_execution,
      ],
      capabilities_executed_this_run: [...resume.capabilities_executed_this_run],
      gpu_jobs_submitted_this_run: resume.capabilities_executed_this_run.length,
      successful_capabilities_never_rerun_automatically: true,
      reused_case_requires_exact_definition_and_evidence_binding: true,
      mixed_fixture_runs_allowed_with_per_case_provenance: true,
      partial_checkpoint_written_after_each_execution: true,
      target_retry_requires_existing_checkpoint: true,
      target_retry_executes_exactly_one_named_capability: true,
      successful_non_target_case_revalidated_before_target_spend: true,
      failed_non_target_case_preserved_without_execution: true,
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
      capabilities_expected: ALL_CAPABILITIES.length,
      capabilities_measured: measured.length,
      capabilities_mechanically_passed: mechanicalPassed.length,
      capabilities_failed: failed.length,
      capabilities_missing: missing.length,
      capabilities_reused: resume.capabilities_reused.length,
      capabilities_preserved_without_execution:
        resume.capabilities_preserved_without_execution.length,
      capabilities_executed_this_run: resume.capabilities_executed_this_run.length,
      targeted_retry_enabled: resume.targeted_retry_enabled,
      target_capability: resume.target_capability,
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
      per_case_fixture_provenance_required: true,
      exact_returned_model_binding_required: true,
      successful_case_reuse_requires_same_benchmark_definition: true,
      successful_case_reuse_requires_same_gpu_rate: true,
      targeted_retry_must_not_execute_unrequested_capabilities: true,
      pricing_status_required: "PRODUCTION_CERTIFIED",
      automatic_activation_forbidden: true,
    },
  };
}

async function writeCheckpoint(resultsByCapability, fixtures, resume) {
  const report = reportFor(orderedResults(resultsByCapability), fixtures, resume);
  await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

const resumeEnabled = enabled(process.env.AVANTIQO_MEDIA_CERTIFICATION_RESUME);
const targetCapability = text(process.env.AVANTIQO_MEDIA_CERTIFICATION_CAPABILITY);
const targetedRetryEnabled = Boolean(targetCapability);
if (targetedRetryEnabled && !ALL_CAPABILITIES.includes(targetCapability)) {
  throw new Error(`AVANTIQO_MEDIA_CERTIFICATION_TARGET_INVALID:${targetCapability}`);
}
if (targetedRetryEnabled && !resumeEnabled) {
  throw new Error("AVANTIQO_MEDIA_CERTIFICATION_TARGET_RETRY_REQUIRES_RESUME");
}

const previousReport = await loadPreviousReport(resumeEnabled);
if (targetedRetryEnabled && !previousReport) {
  throw new Error("AVANTIQO_MEDIA_CERTIFICATION_TARGET_RETRY_CHECKPOINT_REQUIRED");
}

const fixtures = JSON.parse(await readFile(FIXTURES_PATH, "utf8"));
if (fixtures?.contract !== "AVANTIQO_OWNED_MEDIA_CERTIFICATION_FIXTURES_V1") {
  throw new Error("AVANTIQO_MEDIA_CERTIFICATION_FIXTURE_CONTRACT_INVALID");
}
if (fixtures?.source_scope !== "BENCHMARK_ONLY" || fixtures?.provider_calls_added !== 0) {
  throw new Error("AVANTIQO_MEDIA_CERTIFICATION_FIXTURE_SCOPE_INVALID");
}

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
const firstFrame = assertHttps(
  fixtures.video_first_frame_url || fixtures.image_source_url,
  "video_first_frame_url",
);
const lastFrame = assertHttps(fixtures.video_last_frame_url, "video_last_frame_url");
const videoSource = assertHttps(fixtures.video_source_url, "video_source_url");
const videoMask = assertHttps(fixtures.video_mask_url, "video_mask_url");
const lipsyncVideoSource = assertHttps(
  fixtures.lipsync_video_source_url,
  "lipsync_video_source_url",
);
const audioSource = assertHttps(fixtures.audio_source_url, "audio_source_url");

function imageCase(capability, instruction, extra = {}) {
  return {
    engine: "image",
    capability,
    endpointId: imageEndpoint,
    input: {
      ...imageBase(capability, instruction),
      ...extra,
    },
  };
}

function cinemaCase(capability, instruction, extra = {}, endpointId = cinemaEndpoint) {
  return {
    engine: "cinema",
    capability,
    endpointId,
    input: {
      ...cinemaBase(capability, instruction),
      ...extra,
    },
  };
}

const cases = [
  imageCase(
    "ai.image.generate",
    "Generate a premium photorealistic black glass product on a neutral studio surface, no text, no logo.",
    { storage_upload: uploadFor(fixtures, "ai.image.generate") },
  ),
  imageCase(
    "ai.image.edit",
    "Make one controlled material change while preserving composition, identity, geometry and camera.",
    {
      source_asset_roles: { source_image: imageSource },
      source_assets: [imageSource],
      storage_upload: uploadFor(fixtures, "ai.image.edit"),
    },
  ),
  imageCase(
    "ai.image.inpaint",
    "Replace only the masked region with a coherent photorealistic detail; preserve every unmasked pixel.",
    {
      source_asset_roles: { source_image: imageSource, mask_image: imageMask },
      source_assets: [imageSource, imageMask],
      storage_upload: uploadFor(fixtures, "ai.image.inpaint"),
    },
  ),
  imageCase(
    "ai.image.outpaint",
    "Extend the scene naturally while preserving the original image region exactly.",
    {
      source_asset_roles: { source_image: imageSource },
      source_assets: [imageSource],
      structured_specification: {
        output_spec: { aspect_ratio: "16:9" },
        provider_parameters: { seed: 71004, inference_steps: 28 },
      },
      storage_upload: uploadFor(fixtures, "ai.image.outpaint"),
    },
  ),
  imageCase(
    "ai.image.upscale",
    "Increase real detail and clarity without changing identity, composition, colors or geometry.",
    {
      source_asset_roles: { source_image: imageSource },
      source_assets: [imageSource],
      storage_upload: uploadFor(fixtures, "ai.image.upscale"),
    },
  ),
  imageCase(
    "ai.image.analyze",
    "Return strict JSON with keys: description, visible_artifacts, composition_score, realism_score, identity_risk, release_recommendation.",
    {
      source_asset_roles: { source_image: imageSource },
      source_assets: [imageSource],
    },
  ),
  cinemaCase(
    "ai.video.generate",
    "Cinematic slow dolly through a refined dark architectural space with physically realistic materials.",
    { storage_upload: uploadFor(fixtures, "ai.video.generate") },
  ),
  cinemaCase(
    "ai.video.image_to_video",
    "Preserve the reference composition and identity while adding subtle physically plausible cinematic motion.",
    {
      reference_images: [firstFrame],
      storage_upload: uploadFor(fixtures, "ai.video.image_to_video"),
    },
  ),
  cinemaCase(
    "ai.video.first_last_frame_to_video",
    "Create a coherent cinematic transition from the governed opening frame to the governed closing frame.",
    {
      first_frame: firstFrame,
      last_frame: lastFrame,
      storage_upload: uploadFor(fixtures, "ai.video.first_last_frame_to_video"),
    },
  ),
  cinemaCase(
    "ai.video.video_to_video",
    "Transform the visual treatment while preserving source timing, geometry, motion and identity.",
    {
      source_video: videoSource,
      storage_upload: uploadFor(fixtures, "ai.video.video_to_video"),
    },
  ),
  cinemaCase(
    "ai.video.edit",
    "Apply a controlled cinematic visual edit while preserving timing, identity, motion and source geometry.",
    {
      source_video: videoSource,
      storage_upload: uploadFor(fixtures, "ai.video.edit"),
    },
  ),
  cinemaCase(
    "ai.video.inpaint",
    "Regenerate only the masked moving region while preserving every unmasked source region and temporal continuity.",
    {
      source_video: videoSource,
      mask_video: videoMask,
      storage_upload: uploadFor(fixtures, "ai.video.inpaint"),
    },
  ),
  cinemaCase(
    "ai.video.extend",
    "Continue naturally from the exact source tail with consistent identity, camera, physics, lighting and spatial direction.",
    {
      source_video: videoSource,
      storage_upload: uploadFor(fixtures, "ai.video.extend"),
    },
  ),
  cinemaCase(
    "ai.video.upscale",
    "Increase delivery detail while preserving source identity, colors, geometry, timing and motion.",
    {
      source_video: videoSource,
      storage_upload: uploadFor(fixtures, "ai.video.upscale"),
    },
  ),
  cinemaCase(
    "ai.video.lipsync",
    "Synchronize visible speech articulation to the supplied governed audio while preserving facial identity and all non-mouth visual detail.",
    {
      source_video: lipsyncVideoSource,
      source_audio: audioSource,
      source_asset_roles: {
        source_video: lipsyncVideoSource,
        source_audio: audioSource,
      },
      storage_upload: uploadFor(fixtures, "ai.video.lipsync"),
    },
    lipsyncEndpoint,
  ),
];

if (cases.length !== ALL_CAPABILITIES.length) {
  throw new Error(`AVANTIQO_MEDIA_CERTIFICATION_CASE_COUNT_INVALID:${cases.length}`);
}
if (cases.some((item, index) => item.capability !== ALL_CAPABILITIES[index])) {
  throw new Error("AVANTIQO_MEDIA_CERTIFICATION_CASE_ORDER_INVALID");
}

const previousByCapability = previousCaseMap(previousReport);
const resultsByCapability = new Map();
const resumeState = {
  enabled: resumeEnabled,
  previous_report_loaded: Boolean(previousReport),
  previous_report_generated_at: text(previousReport?.generated_at) || null,
  targeted_retry_enabled: targetedRetryEnabled,
  target_capability: targetCapability || null,
  capabilities_reused: [],
  capabilities_preserved_without_execution: [],
  capabilities_executed_this_run: [],
};

if (targetedRetryEnabled) {
  for (const benchmark of cases) {
    if (benchmark.capability === targetCapability) continue;
    const prior = previousByCapability.get(benchmark.capability) || null;
    if (!prior) {
      throw new Error(
        `AVANTIQO_MEDIA_CERTIFICATION_TARGET_RETRY_NON_TARGET_CHECKPOINT_MISSING:${benchmark.capability}`,
      );
    }
    if (
      text(prior.capability) !== benchmark.capability ||
      text(prior.engine) !== benchmark.engine
    ) {
      throw new Error(
        `AVANTIQO_MEDIA_CERTIFICATION_TARGET_RETRY_NON_TARGET_CHECKPOINT_INVALID:${benchmark.capability}`,
      );
    }
    if (prior.mechanical_passed === true && !reusablePriorCase(prior, benchmark)) {
      throw new Error(
        `AVANTIQO_MEDIA_CERTIFICATION_TARGET_RETRY_NON_TARGET_SUCCESS_STALE:${benchmark.capability}`,
      );
    }
  }

  for (const benchmark of cases) {
    if (benchmark.capability === targetCapability) continue;
    const prior = previousByCapability.get(benchmark.capability);
    resultsByCapability.set(benchmark.capability, {
      ...prior,
      resumed_from_previous_report: true,
    });
    if (prior.mechanical_passed === true) {
      resumeState.capabilities_reused.push(benchmark.capability);
    } else {
      resumeState.capabilities_preserved_without_execution.push(benchmark.capability);
    }
  }

  const targetBenchmark = cases.find(
    (benchmark) => benchmark.capability === targetCapability,
  );
  const prior = previousByCapability.get(targetCapability) || null;
  console.log(`TARGET_RETRY ${targetCapability}`);
  const result = await benchmarkCase(targetBenchmark, fixtures, prior);
  resultsByCapability.set(targetCapability, result);
  resumeState.capabilities_executed_this_run.push(targetCapability);
  await writeCheckpoint(resultsByCapability, fixtures, resumeState);
} else {
  for (const benchmark of cases) {
    const prior = previousByCapability.get(benchmark.capability) || null;
    if (resumeEnabled && reusablePriorCase(prior, benchmark)) {
      console.log(`REUSE ${benchmark.capability}`);
      resultsByCapability.set(benchmark.capability, {
        ...prior,
        resumed_from_previous_report: true,
      });
      resumeState.capabilities_reused.push(benchmark.capability);
      continue;
    }

    console.log(`BENCHMARK ${benchmark.capability}`);
    const result = await benchmarkCase(benchmark, fixtures, prior);
    resultsByCapability.set(benchmark.capability, result);
    resumeState.capabilities_executed_this_run.push(benchmark.capability);
    await writeCheckpoint(resultsByCapability, fixtures, resumeState);
  }
}

const report = await writeCheckpoint(resultsByCapability, fixtures, resumeState);
const targetResult = targetedRetryEnabled
  ? resultsByCapability.get(targetCapability)
  : null;
const runSucceeded = targetedRetryEnabled
  ? targetResult?.mechanical_passed === true
  : report.summary.all_mechanical_checks_passed;

console.log(
  JSON.stringify(
    {
      success: runSucceeded,
      output_path: OUTPUT,
      resume_enabled: resumeEnabled,
      targeted_retry_enabled: targetedRetryEnabled,
      target_capability: targetCapability || null,
      target_mechanical_passed: targetResult?.mechanical_passed ?? null,
      reused_capabilities: report.summary.capabilities_reused,
      preserved_without_execution:
        report.summary.capabilities_preserved_without_execution,
      executed_this_run: report.summary.capabilities_executed_this_run,
      summary: report.summary,
      activation_allowed: false,
    },
    null,
    2,
  ),
);

if (!runSucceeded) process.exitCode = 1;
