import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const CONTRACT = "AVANTIQO_OWNED_MEDIA_CERTIFICATION_STATUS_V1";
const BENCHMARK_CONTRACT = "AVANTIQO_OWNED_MEDIA_FULL_CAPABILITY_BENCHMARK_V1";
const FIXTURE_CONTRACT = "AVANTIQO_OWNED_MEDIA_CERTIFICATION_FIXTURES_V1";
const CHECKPOINT = resolve(
  process.env.AVANTIQO_MEDIA_FULL_BENCHMARK_OUTPUT ||
    "/tmp/avantiqo-owned-media-full-capability-benchmark.json",
);
const OUTPUT = resolve(
  process.env.AVANTIQO_MEDIA_CERTIFICATION_STATUS_OUTPUT ||
    "/tmp/avantiqo-owned-media-certification-status.json",
);
const FRESH_CAMPAIGN_COMMAND =
  "sh scripts/certify-avantiqo-owned-media-local.sh";
const RESUME_CAMPAIGN_COMMAND =
  "AVANTIQO_MEDIA_CERTIFICATION_RESUME=1 sh scripts/certify-avantiqo-owned-media-local.sh";

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

function finiteEvidence(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function positiveEvidence(value) {
  return finiteEvidence(value) && Number(value) > 0;
}

function engineFor(capability) {
  return capability.startsWith("ai.image.") ? "image" : "cinema";
}

function engineContractFor(capability) {
  return capability.startsWith("ai.image.")
    ? "AVANTIQO_IMAGE_ENGINE_V1"
    : "AVANTIQO_SYNTHETIC_VIDEO_ENGINE_V1";
}

function targetedRetryCommand(capability) {
  return `AVANTIQO_MEDIA_CERTIFICATION_RESUME=1 AVANTIQO_MEDIA_CERTIFICATION_CAPABILITY=${capability} sh scripts/certify-avantiqo-owned-media-local.sh`;
}

function rateFor(capability) {
  const family = capability === "ai.video.lipsync"
    ? "lipsync"
    : capability.startsWith("ai.image.")
      ? "image"
      : "cinema";
  const envName = ECONOMICS_RATE_ENV[family];
  const value = Number(process.env[envName]);
  return {
    env_name: envName,
    configured: Number.isFinite(value) && value > 0,
    usd_per_second: Number.isFinite(value) && value > 0 ? value : null,
  };
}

function staleReasons(capability, item) {
  const reasons = [];
  const output = object(item.output);
  const provenance = object(item.fixture_provenance);
  const economics = object(item.economics);
  const currentRate = rateFor(capability);

  if (item.attempted !== true) reasons.push("ATTEMPT_EVIDENCE_MISSING");
  if (text(item.capability) !== capability) reasons.push("CAPABILITY_BINDING_INVALID");
  if (text(item.engine) !== engineFor(capability)) reasons.push("ENGINE_BINDING_INVALID");
  if (!text(item.benchmark_definition_sha256)) {
    reasons.push("BENCHMARK_DEFINITION_BINDING_MISSING");
  }
  if (!text(item.foundation_model)) reasons.push("FOUNDATION_MODEL_MISSING");

  if (text(provenance.contract) !== FIXTURE_CONTRACT) {
    reasons.push("FIXTURE_CONTRACT_INVALID");
  }
  if (!text(provenance.prefix)) reasons.push("FIXTURE_PREFIX_MISSING");
  if (!text(provenance.fingerprint_sha256)) {
    reasons.push("FIXTURE_FINGERPRINT_MISSING");
  }
  if (Object.keys(object(provenance.source_storage_references)).length === 0) {
    reasons.push("SOURCE_STORAGE_PROVENANCE_MISSING");
  }

  if (text(output.capability) !== capability) reasons.push("OUTPUT_CAPABILITY_INVALID");
  if (text(output.foundation_model) !== text(item.foundation_model)) {
    reasons.push("RETURNED_MODEL_BINDING_INVALID");
  }
  if (text(output.engine_contract) !== engineContractFor(capability)) {
    reasons.push("ENGINE_CONTRACT_INVALID");
  }
  if (output.certification_execution !== true) {
    reasons.push("CERTIFICATION_EXECUTION_EVIDENCE_MISSING");
  }
  if (output.raw_reasoning_persisted !== false) {
    reasons.push("RAW_REASONING_POLICY_INVALID");
  }

  if (capability === "ai.image.analyze") {
    if (output.structured_visual_evidence !== true) {
      reasons.push("STRUCTURED_VISUAL_EVIDENCE_MISSING");
    }
    if (Object.keys(object(output.result)).length === 0) {
      reasons.push("ANALYSIS_RESULT_MISSING");
    }
  } else {
    const storageReference = text(item.storage_reference);
    if (!storageReference.startsWith("storage://creative-assets/")) {
      reasons.push("OUTPUT_STORAGE_REFERENCE_INVALID");
    }
    if (text(output.storage_reference) !== storageReference) {
      reasons.push("OUTPUT_STORAGE_BINDING_INVALID");
    }
    if (text(provenance.output_storage_reference) !== storageReference) {
      reasons.push("OUTPUT_PROVENANCE_BINDING_INVALID");
    }
    if (!(Number(output.size_bytes) > 10000)) {
      reasons.push("OUTPUT_SIZE_EVIDENCE_INVALID");
    }
  }

  if (!currentRate.configured) {
    reasons.push(`CURRENT_GPU_RATE_NOT_CONFIGURED:${currentRate.env_name}`);
  }
  if (economics.rate_configured !== true) {
    reasons.push("MEASURED_GPU_RATE_NOT_CONFIGURED");
  }
  if (!positiveEvidence(economics.usd_per_second)) {
    reasons.push("MEASURED_GPU_RATE_INVALID");
  }
  if (
    currentRate.configured &&
    Number(economics.usd_per_second) !== currentRate.usd_per_second
  ) {
    reasons.push("GPU_RATE_CHANGED_SINCE_MEASUREMENT");
  }
  if (!positiveEvidence(economics.observed_seconds)) {
    reasons.push("ECONOMICS_OBSERVED_SECONDS_MISSING");
  }
  if (!positiveEvidence(item.wall_ms)) {
    reasons.push("BENCHMARK_WALL_TIME_MISSING");
  }
  if (!finiteEvidence(economics.estimated_supplier_compute_cost_usd)) {
    reasons.push("ECONOMICS_MEASUREMENT_MISSING");
  }
  if (item.production_certified !== false) {
    reasons.push("UNEXPECTED_PRODUCTION_CERTIFICATION_STATE");
  }

  return reasons;
}

async function readCheckpoint() {
  try {
    return JSON.parse(await readFile(CHECKPOINT, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

const checkpoint = await readCheckpoint();
if (checkpoint && checkpoint?.contract !== BENCHMARK_CONTRACT) {
  throw new Error("AVANTIQO_MEDIA_CERTIFICATION_STATUS_CHECKPOINT_CONTRACT_INVALID");
}
if (checkpoint && checkpoint?.source_scope !== "BENCHMARK_ONLY") {
  throw new Error("AVANTIQO_MEDIA_CERTIFICATION_STATUS_SCOPE_INVALID");
}
if (checkpoint && checkpoint?.activation_allowed !== false) {
  throw new Error("AVANTIQO_MEDIA_CERTIFICATION_STATUS_ACTIVATION_STATE_INVALID");
}

const byCapability = new Map();
for (const item of list(checkpoint?.cases)) {
  const capability = text(item?.capability);
  if (!ALL_CAPABILITIES.includes(capability)) continue;
  if (byCapability.has(capability)) {
    throw new Error(`AVANTIQO_MEDIA_CERTIFICATION_STATUS_DUPLICATE_CASE:${capability}`);
  }
  byCapability.set(capability, item);
}

const checkpointCoverageComplete =
  Boolean(checkpoint) && ALL_CAPABILITIES.every((capability) => byCapability.has(capability));

function recoveryCommand(capability) {
  if (!checkpoint) return FRESH_CAMPAIGN_COMMAND;
  if (!checkpointCoverageComplete) return RESUME_CAMPAIGN_COMMAND;
  return targetedRetryCommand(capability);
}

const statuses = ALL_CAPABILITIES.map((capability) => {
  const item = byCapability.get(capability) || null;
  if (!item) {
    return {
      capability,
      engine: engineFor(capability),
      status: "MISSING",
      reason_codes: ["NO_CHECKPOINT_CASE"],
      attempt_number: 0,
      foundation_model: null,
      output_storage_reference: null,
      estimated_supplier_compute_cost_usd: null,
      recommended_command: recoveryCommand(capability),
    };
  }

  if (item.mechanical_passed !== true) {
    return {
      capability,
      engine: engineFor(capability),
      status: "FAILED",
      reason_codes: [text(item.error) || "MECHANICAL_CHECK_FAILED"],
      attempt_number: Number(item.attempt_number || 1),
      foundation_model: text(item.foundation_model) || null,
      output_storage_reference: text(item.storage_reference) || null,
      estimated_supplier_compute_cost_usd:
        finiteEvidence(item?.economics?.estimated_supplier_compute_cost_usd)
          ? Number(item.economics.estimated_supplier_compute_cost_usd)
          : null,
      recommended_command: recoveryCommand(capability),
    };
  }

  const reasons = staleReasons(capability, item);
  return {
    capability,
    engine: engineFor(capability),
    status: reasons.length === 0 ? "PASSED" : "STALE",
    reason_codes: reasons,
    attempt_number: Number(item.attempt_number || 1),
    foundation_model: text(item.foundation_model) || null,
    output_storage_reference: text(item.storage_reference) || null,
    fixture_prefix: text(item?.fixture_provenance?.prefix) || null,
    benchmark_definition_sha256: text(item.benchmark_definition_sha256) || null,
    measured_gpu_rate_usd_per_second:
      positiveEvidence(item?.economics?.usd_per_second)
        ? Number(item.economics.usd_per_second)
        : null,
    current_gpu_rate_usd_per_second: rateFor(capability).usd_per_second,
    estimated_supplier_compute_cost_usd:
      finiteEvidence(item?.economics?.estimated_supplier_compute_cost_usd)
        ? Number(item.economics.estimated_supplier_compute_cost_usd)
        : null,
    recommended_command: reasons.length > 0 ? recoveryCommand(capability) : null,
  };
});

const count = (status) => statuses.filter((item) => item.status === status).length;
const passed = count("PASSED");
const failed = count("FAILED");
const stale = count("STALE");
const missing = count("MISSING");
const readyForHumanQualityReview =
  passed === ALL_CAPABILITIES.length && failed === 0 && stale === 0 && missing === 0;

const recommendedAction = readyForHumanQualityReview
  ? { mode: "HUMAN_QUALITY_REVIEW", command: null }
  : !checkpoint
    ? { mode: "FRESH_CAMPAIGN", command: FRESH_CAMPAIGN_COMMAND }
    : !checkpointCoverageComplete
      ? { mode: "RESUME_CAMPAIGN", command: RESUME_CAMPAIGN_COMMAND }
      : {
          mode: "TARGETED_RETRY_AVAILABLE",
          command: recoveryCommand(
            statuses.find((item) => item.status !== "PASSED")?.capability,
          ),
        };

const report = {
  contract: CONTRACT,
  generated_at: new Date().toISOString(),
  checkpoint_path: CHECKPOINT,
  checkpoint_found: Boolean(checkpoint),
  checkpoint_generated_at: text(checkpoint?.generated_at) || null,
  checkpoint_capability_coverage_complete: checkpointCoverageComplete,
  source_scope: "BENCHMARK_ONLY",
  statuses,
  summary: {
    capabilities_expected: ALL_CAPABILITIES.length,
    passed,
    failed,
    stale,
    missing,
    ready_for_human_quality_review: readyForHumanQualityReview,
    next_retry_capabilities: statuses
      .filter((item) => item.status !== "PASSED")
      .map((item) => item.capability),
    recommended_action: recommendedAction,
  },
  safety: {
    diagnostic_only: true,
    network_requests_performed: 0,
    runpod_jobs_submitted: 0,
    fixture_generation_performed: false,
    storage_mutations_performed: 0,
    production_activation_performed: false,
    pricing_activation_performed: false,
  },
  rule: {
    passed_means_mechanical_and_economics_evidence_current: true,
    failed_means_latest_execution_did_not_pass_mechanical_checks: true,
    stale_means_prior_pass_exists_but_current_evidence_binding_is_not_reusable: true,
    missing_means_no_checkpoint_case_exists: true,
    fresh_campaign_required_when_checkpoint_absent: true,
    resume_campaign_required_while_checkpoint_coverage_is_partial: true,
    targeted_retry_only_recommended_after_all_capabilities_have_checkpoint_cases: true,
    human_visual_review_still_required_after_all_passed: true,
    diagnostic_does_not_certify_or_activate_production: true,
  },
};

await writeFile(OUTPUT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
