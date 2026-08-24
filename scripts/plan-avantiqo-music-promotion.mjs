import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  AVANTIQO_OWNED_MODEL_CATALOG,
  AVANTIQO_OWNED_MEDIA_CERTIFICATION_EVIDENCE_CONTRACT,
} from "../lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js";

const CONTRACT = "AVANTIQO_MUSIC_PROMOTION_PLAN_V1";
const BENCHMARK_CONTRACT = "AVANTIQO_MUSIC_CERTIFICATION_BENCHMARK_V3";
const ECONOMICS_CONTRACT = "AVANTIQO_MUSIC_ECONOMICS_V1";
const HUMAN_EVIDENCE_CONTRACT = "AVANTIQO_OWNED_MEDIA_CERTIFICATION_EVIDENCE_V1";
const PROVIDER = "avantiqo-audio";
const MODEL = "ACE-Step/Ace-Step1.5";
const CAPABILITY = "ai.music.generate";
const MODEL_VARIANT = "acestep-v15-xl-turbo";
const LM_MODEL = "acestep-5Hz-lm-1.7B";
const LM_BACKEND = "vllm";
const QUALITY_PROFILE = "ACE_STEP_1_5_XL_TURBO_1_7B_LM_V1";

const BENCHMARK_INPUT = resolve(
  process.env.AVANTIQO_AUDIO_BENCHMARK_OUTPUT ||
    "/tmp/avantiqo-music-certification-benchmark.json",
);
const ECONOMICS_INPUT = resolve(
  process.env.AVANTIQO_AUDIO_ECONOMICS_OUTPUT ||
    "/tmp/avantiqo-music-economics.json",
);
const HUMAN_INPUT = resolve(
  process.env.AVANTIQO_MUSIC_CERTIFICATION_EVIDENCE_OUTPUT ||
    "/tmp/avantiqo-music-certification-evidence.json",
);
const OUTPUT = resolve(
  process.env.AVANTIQO_MUSIC_PROMOTION_PLAN_OUTPUT ||
    "/tmp/avantiqo-music-promotion-plan.json",
);

function text(value) {
  return String(value ?? "").trim();
}

function validIso(value) {
  const candidate = text(value);
  return Boolean(candidate && Number.isFinite(Date.parse(candidate)));
}

const [benchmark, economics, human] = await Promise.all([
  readFile(BENCHMARK_INPUT, "utf8").then(JSON.parse),
  readFile(ECONOMICS_INPUT, "utf8").then(JSON.parse),
  readFile(HUMAN_INPUT, "utf8").then(JSON.parse),
]);

const failures = [];

if (text(benchmark?.contract) !== BENCHMARK_CONTRACT) failures.push("BENCHMARK_CONTRACT_INVALID");
if (benchmark?.summary?.passed !== true) failures.push("BENCHMARK_PASS_REQUIRED");
if (text(benchmark?.model?.provider) !== PROVIDER) failures.push("BENCHMARK_PROVIDER_MISMATCH");
if (text(benchmark?.model?.foundation_model) !== MODEL) failures.push("BENCHMARK_MODEL_MISMATCH");
if (text(benchmark?.model?.variant) !== MODEL_VARIANT) failures.push("BENCHMARK_VARIANT_MISMATCH");
if (text(benchmark?.model?.quality_profile) !== QUALITY_PROFILE) failures.push("BENCHMARK_QUALITY_PROFILE_MISMATCH");
if (benchmark?.model?.ace_step_lm_required !== true) failures.push("BENCHMARK_LM_REQUIRED");
if (text(benchmark?.model?.ace_step_lm_model) !== LM_MODEL) failures.push("BENCHMARK_LM_MODEL_MISMATCH");
if (text(benchmark?.model?.ace_step_lm_backend) !== LM_BACKEND) failures.push("BENCHMARK_LM_BACKEND_MISMATCH");
if (benchmark?.model?.thinking_required !== true) failures.push("BENCHMARK_THINKING_REQUIRED");
if (text(benchmark?.model?.capability) !== CAPABILITY) failures.push("BENCHMARK_CAPABILITY_MISMATCH");

if (text(economics?.contract) !== ECONOMICS_CONTRACT) failures.push("ECONOMICS_CONTRACT_INVALID");
if (text(economics?.provider) !== PROVIDER) failures.push("ECONOMICS_PROVIDER_MISMATCH");
if (text(economics?.foundation_model) !== MODEL) failures.push("ECONOMICS_MODEL_MISMATCH");
if (text(economics?.model_variant) !== MODEL_VARIANT) failures.push("ECONOMICS_VARIANT_MISMATCH");
if (text(economics?.quality_profile) !== QUALITY_PROFILE) failures.push("ECONOMICS_QUALITY_PROFILE_MISMATCH");
if (economics?.ace_step_lm_required !== true) failures.push("ECONOMICS_LM_REQUIRED");
if (text(economics?.ace_step_lm_model) !== LM_MODEL) failures.push("ECONOMICS_LM_MODEL_MISMATCH");
if (text(economics?.ace_step_lm_backend) !== LM_BACKEND) failures.push("ECONOMICS_LM_BACKEND_MISMATCH");
if (economics?.thinking_required !== true) failures.push("ECONOMICS_THINKING_REQUIRED");
if (text(economics?.capability) !== CAPABILITY) failures.push("ECONOMICS_CAPABILITY_MISMATCH");
if (text(economics?.source_benchmark_id) !== text(benchmark?.benchmark_id)) failures.push("ECONOMICS_BENCHMARK_ID_MISMATCH");
if (economics?.certification?.benchmark_certified !== true) failures.push("ECONOMICS_BENCHMARK_CERTIFICATION_REQUIRED");
if (economics?.certification?.economics_measured !== true) failures.push("ECONOMICS_MEASUREMENT_REQUIRED");
if (!Number.isFinite(Number(economics?.summary?.utilization_adjusted_compute_usd_per_audio_second))) {
  failures.push("ECONOMICS_AUDIO_SECOND_RATE_REQUIRED");
}
if (economics?.pricing_activation_performed !== false || economics?.activation_allowed !== false) {
  failures.push("ECONOMICS_EVIDENCE_MUST_REMAIN_PRE_PROMOTION");
}

if (text(human?.contract) !== HUMAN_EVIDENCE_CONTRACT) failures.push("HUMAN_EVIDENCE_CONTRACT_INVALID");
if (HUMAN_EVIDENCE_CONTRACT !== AVANTIQO_OWNED_MEDIA_CERTIFICATION_EVIDENCE_CONTRACT) {
  failures.push("SHARED_MEDIA_EVIDENCE_CONTRACT_MISMATCH");
}
if (human?.human_quality_certified !== true) failures.push("HUMAN_QUALITY_CERTIFICATION_REQUIRED");
if (human?.economics_evidence_complete !== true) failures.push("HUMAN_EVIDENCE_ECONOMICS_REQUIRED");
if (text(human?.benchmark_id) !== text(benchmark?.benchmark_id)) failures.push("HUMAN_BENCHMARK_ID_MISMATCH");
if (human?.production_certified !== false || human?.activation_allowed !== false) {
  failures.push("HUMAN_EVIDENCE_MUST_REMAIN_PRE_PROMOTION");
}

const humanCapability = (Array.isArray(human?.capabilities) ? human.capabilities : [])
  .find((item) => text(item?.capability) === CAPABILITY);
if (!humanCapability) {
  failures.push("HUMAN_CAPABILITY_EVIDENCE_REQUIRED");
} else {
  if (text(humanCapability.engine) !== PROVIDER) failures.push("HUMAN_PROVIDER_MISMATCH");
  if (text(humanCapability.model) !== MODEL) failures.push("HUMAN_MODEL_MISMATCH");
  if (text(humanCapability.model_variant) !== MODEL_VARIANT) failures.push("HUMAN_VARIANT_MISMATCH");
  if (text(humanCapability.quality_profile) !== QUALITY_PROFILE) failures.push("HUMAN_QUALITY_PROFILE_MISMATCH");
  if (humanCapability.ace_step_lm_required !== true) failures.push("HUMAN_LM_REQUIRED");
  if (text(humanCapability.ace_step_lm_model) !== LM_MODEL) failures.push("HUMAN_LM_MODEL_MISMATCH");
  if (text(humanCapability.ace_step_lm_backend) !== LM_BACKEND) failures.push("HUMAN_LM_BACKEND_MISMATCH");
  if (humanCapability.thinking_required !== true) failures.push("HUMAN_THINKING_REQUIRED");
  if (humanCapability.human_quality_passed !== true) failures.push("HUMAN_CAPABILITY_PASS_REQUIRED");
  if (!text(humanCapability.reviewer)) failures.push("HUMAN_REVIEWER_REQUIRED");
  if (!validIso(humanCapability.reviewed_at)) failures.push("HUMAN_REVIEWED_AT_REQUIRED");
}

const model = AVANTIQO_OWNED_MODEL_CATALOG?.[PROVIDER]?.models?.[MODEL];
if (model?.license_verified !== true) failures.push("MODEL_LICENSE_NOT_VERIFIED");
if (model?.runtime_compatible !== true) failures.push("MODEL_RUNTIME_NOT_COMPATIBLE");
if (!model?.capabilities?.includes(CAPABILITY)) failures.push("MODEL_CAPABILITY_NOT_APPROVED");

if (failures.length) {
  throw new Error(`AVANTIQO_MUSIC_PROMOTION_PLAN_BLOCKED:${failures.join(",")}`);
}

const measuredUsdPerAudioSecond = Number(
  economics.summary.utilization_adjusted_compute_usd_per_audio_second,
);
const measuredUsdPerAudioMinute = Number(
  economics.summary.utilization_adjusted_compute_usd_per_audio_minute,
);
const reviewer = text(humanCapability.reviewer);
const reviewedAt = text(humanCapability.reviewed_at);

const plan = {
  contract: CONTRACT,
  generated_at: new Date().toISOString(),
  provider: PROVIDER,
  capability: CAPABILITY,
  foundation_model: MODEL,
  model_family: "ACE_STEP_1_5",
  model_variant: MODEL_VARIANT,
  quality_profile: QUALITY_PROFILE,
  ace_step_lm_required: true,
  ace_step_lm_model: LM_MODEL,
  ace_step_lm_backend: LM_BACKEND,
  thinking_required: true,
  evidence: {
    benchmark_contract: BENCHMARK_CONTRACT,
    benchmark_id: benchmark.benchmark_id || null,
    benchmark_passed: true,
    economics_contract: ECONOMICS_CONTRACT,
    economics_measured: true,
    measured_compute_usd_per_audio_second: measuredUsdPerAudioSecond,
    measured_compute_usd_per_audio_minute: measuredUsdPerAudioMinute,
    human_quality_evidence_contract: HUMAN_EVIDENCE_CONTRACT,
    human_quality_certified: true,
    human_quality_reviewer: reviewer,
    human_quality_reviewed_at: reviewedAt,
  },
  required_current_state: {
    active: false,
    pricing_status: "MARKET_PARITY_READY",
    owned_inference: true,
    runtime_compatible: true,
    model_license_verified: true,
    production_routing_allowed: false,
  },
  required_pricing_metadata_after_explicit_promotion: {
    pricing_status: "PRODUCTION_CERTIFIED",
    owned_inference: true,
    benchmark_certified: true,
    economics_certified: true,
    human_quality_certified: true,
    human_quality_evidence_contract: HUMAN_EVIDENCE_CONTRACT,
    human_quality_reviewer: reviewer,
    human_quality_reviewed_at: reviewedAt,
    certified_capability: CAPABILITY,
    certified_model: MODEL,
    certified_model_variant: MODEL_VARIANT,
    quality_profile: QUALITY_PROFILE,
    ace_step_lm_required: true,
    ace_step_lm_model: LM_MODEL,
    ace_step_lm_backend: LM_BACKEND,
    thinking_required: true,
    model_license_verified: true,
    runtime_compatible: true,
    recalibration_required: false,
    production_routing_allowed: true,
    certification_benchmark_contract: BENCHMARK_CONTRACT,
    certification_economics_contract: ECONOMICS_CONTRACT,
    measured_compute_usd_per_audio_second: measuredUsdPerAudioSecond,
    measured_compute_usd_per_audio_minute: measuredUsdPerAudioMinute,
  },
  required_row_state_after_explicit_promotion: {
    active: true,
  },
  certification_environment: {
    name: "AVANTIQO_AUDIO_CERTIFIED_CAPABILITIES",
    value: CAPABILITY,
  },
  pricing_review: {
    required: true,
    reason: "MEASURED_GPU_ECONOMICS_AND_HUMAN_AUDIO_QUALITY_MUST_BE_ACCEPTED_BEFORE_DATABASE_PROMOTION",
  },
  mutation_performed: false,
  pricing_mutation_performed: false,
  provider_configuration_mutation_performed: false,
  production_deployment_performed: false,
  activation_performed: false,
  automatic_activation_forbidden: true,
  ready_for_explicit_pricing_review: true,
  ready_for_explicit_promotion: false,
};

await writeFile(OUTPUT, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  success: true,
  output_path: OUTPUT,
  capability: CAPABILITY,
  quality_profile: QUALITY_PROFILE,
  measured_compute_usd_per_audio_second: measuredUsdPerAudioSecond,
  human_quality_reviewer: reviewer,
  ready_for_explicit_pricing_review: true,
  ready_for_explicit_promotion: false,
  activation_performed: false,
  production_deployment_performed: false,
}, null, 2));
