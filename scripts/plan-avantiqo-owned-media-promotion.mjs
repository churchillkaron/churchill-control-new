import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  AVANTIQO_OWNED_MODEL_CATALOG,
  AVANTIQO_OWNED_MEDIA_CERTIFICATION_EVIDENCE_CONTRACT,
} from "../lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js";

const INPUT = resolve(
  process.env.AVANTIQO_MEDIA_CERTIFICATION_EVIDENCE_OUTPUT ||
    "/tmp/avantiqo-owned-media-certification-evidence.json",
);
const OUTPUT = resolve(
  process.env.AVANTIQO_MEDIA_PROMOTION_PLAN_OUTPUT ||
    "/tmp/avantiqo-owned-media-promotion-plan.json",
);

const EXPECTED_IMAGE_CAPABILITIES = Object.freeze([
  "ai.image.generate",
  "ai.image.edit",
  "ai.image.inpaint",
  "ai.image.outpaint",
  "ai.image.upscale",
  "ai.image.analyze",
]);
const EXPECTED_VIDEO_CAPABILITIES = Object.freeze([
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
const EXPECTED_CAPABILITIES = Object.freeze([
  ...EXPECTED_IMAGE_CAPABILITIES,
  ...EXPECTED_VIDEO_CAPABILITIES,
]);

function text(value) {
  return String(value ?? "").trim();
}

function providerForCapability(capability) {
  if (capability.startsWith("ai.image.")) return "avantiqo-image";
  if (capability.startsWith("ai.video.")) return "avantiqo-video";
  return null;
}

function engineForCapability(capability) {
  if (capability.startsWith("ai.image.")) return "IMAGE";
  if (capability.startsWith("ai.video.")) return "CINEMA";
  return null;
}

function approvedModel(provider, model, capability) {
  const certification = AVANTIQO_OWNED_MODEL_CATALOG?.[provider]?.models?.[model];
  return Boolean(
    certification?.license_verified === true &&
      certification?.runtime_compatible === true &&
      certification?.capabilities?.includes(capability),
  );
}

const evidence = JSON.parse(await readFile(INPUT, "utf8"));
const failures = [];

if (evidence?.contract !== AVANTIQO_OWNED_MEDIA_CERTIFICATION_EVIDENCE_CONTRACT) {
  failures.push("CERTIFICATION_EVIDENCE_CONTRACT_INVALID");
}
if (evidence?.source_scope !== "BENCHMARK_ONLY") {
  failures.push("CERTIFICATION_SOURCE_SCOPE_INVALID");
}
if (evidence?.capability_count !== 15) {
  failures.push("CERTIFICATION_CAPABILITY_COUNT_INVALID");
}
if (evidence?.mechanically_certified_for_review !== true) {
  failures.push("MECHANICAL_CERTIFICATION_REQUIRED");
}
if (evidence?.economics_evidence_complete !== true) {
  failures.push("ECONOMICS_EVIDENCE_REQUIRED");
}
if (evidence?.human_quality_certified !== true) {
  failures.push("HUMAN_QUALITY_CERTIFICATION_REQUIRED");
}
if (evidence?.production_certified !== false || evidence?.activation_allowed !== false) {
  failures.push("EVIDENCE_MUST_REMAIN_PRE_PROMOTION");
}
if (!Array.isArray(evidence?.capabilities) || evidence.capabilities.length !== 15) {
  failures.push("CERTIFICATION_CAPABILITIES_INVALID");
}

const byCapability = new Map();
for (const item of evidence?.capabilities || []) {
  const capability = text(item.capability);
  if (!capability) {
    failures.push("CAPABILITY_REQUIRED");
    continue;
  }
  if (byCapability.has(capability)) {
    failures.push(`${capability}:DUPLICATE_CAPABILITY`);
    continue;
  }
  byCapability.set(capability, item);
}

for (const capability of EXPECTED_CAPABILITIES) {
  if (!byCapability.has(capability)) failures.push(`${capability}:EVIDENCE_MISSING`);
}
for (const capability of byCapability.keys()) {
  if (!EXPECTED_CAPABILITIES.includes(capability)) {
    failures.push(`${capability}:UNEXPECTED_CAPABILITY`);
  }
}

const promotions = EXPECTED_CAPABILITIES.map((capability) => {
  const item = byCapability.get(capability) || {};
  const provider = providerForCapability(capability);
  const expectedEngine = engineForCapability(capability);
  const engine = text(item.engine).toUpperCase();
  const model = text(item.model);
  const reviewer = text(item.reviewer);
  const reviewedAt = text(item.reviewed_at);
  const economics = item.economics || {};

  if (engine !== expectedEngine) failures.push(`${capability}:ENGINE_MISMATCH`);
  if (!model) failures.push(`${capability}:MODEL_REQUIRED`);
  if (!approvedModel(provider, model, capability)) {
    failures.push(`${capability}:MODEL_NOT_APPROVED_FOR_CAPABILITY`);
  }
  if (item.mechanical_passed !== true) failures.push(`${capability}:MECHANICAL_PASS_REQUIRED`);
  if (text(item.review_status).toUpperCase() !== "PASS") {
    failures.push(`${capability}:HUMAN_REVIEW_PASS_REQUIRED`);
  }
  if (item.human_quality_passed !== true) {
    failures.push(`${capability}:HUMAN_QUALITY_PASS_REQUIRED`);
  }
  if (!reviewer) failures.push(`${capability}:REVIEWER_REQUIRED`);
  if (!reviewedAt || !Number.isFinite(Date.parse(reviewedAt))) {
    failures.push(`${capability}:REVIEWED_AT_REQUIRED`);
  }
  if (!text(item.output_storage_reference)) {
    failures.push(`${capability}:OUTPUT_EVIDENCE_REQUIRED`);
  }
  if (
    economics.rate_configured !== true ||
    !Number.isFinite(economics.estimated_supplier_compute_cost_usd)
  ) {
    failures.push(`${capability}:ECONOMICS_EVIDENCE_INCOMPLETE`);
  }

  return {
    engine: expectedEngine,
    provider,
    capability,
    model,
    reviewer,
    reviewed_at: reviewedAt || null,
    output_storage_reference: item.output_storage_reference || null,
    estimated_supplier_compute_cost_usd:
      Number.isFinite(economics.estimated_supplier_compute_cost_usd)
        ? economics.estimated_supplier_compute_cost_usd
        : null,
    required_pricing_metadata: {
      pricing_status: "PRODUCTION_CERTIFIED",
      owned_inference: true,
      benchmark_certified: true,
      economics_certified: true,
      model_license_verified: true,
      recalibration_required: false,
      human_quality_certified: true,
      human_quality_evidence_contract:
        AVANTIQO_OWNED_MEDIA_CERTIFICATION_EVIDENCE_CONTRACT,
      certified_capability: capability,
      certified_model: model,
      human_quality_reviewer: reviewer,
      human_quality_reviewed_at: reviewedAt || null,
    },
    provider_certification_environment: provider === "avantiqo-image"
      ? "AVANTIQO_IMAGE_CERTIFIED_CAPABILITIES"
      : "AVANTIQO_VIDEO_CERTIFIED_CAPABILITIES",
    ready_for_explicit_promotion: true,
  };
});

if (failures.length) {
  throw new Error(`AVANTIQO_MEDIA_PROMOTION_PLAN_BLOCKED:${failures.join(",")}`);
}

const plan = {
  contract: "AVANTIQO_OWNED_MEDIA_PROMOTION_PLAN_V1",
  generated_at: new Date().toISOString(),
  source_evidence_contract: evidence.contract,
  source_evidence_path: INPUT,
  capability_count: promotions.length,
  image_capability_count: EXPECTED_IMAGE_CAPABILITIES.length,
  video_capability_count: EXPECTED_VIDEO_CAPABILITIES.length,
  promotions,
  image_certified_capabilities_value: EXPECTED_IMAGE_CAPABILITIES.join(","),
  video_certified_capabilities_value: EXPECTED_VIDEO_CAPABILITIES.join(","),
  mutation_performed: false,
  pricing_mutation_performed: false,
  provider_configuration_mutation_performed: false,
  production_deployment_performed: false,
  activation_performed: false,
  manual_explicit_promotion_required: true,
  automatic_activation_forbidden: true,
  ready_for_explicit_promotion: true,
};

await writeFile(OUTPUT, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
console.log(JSON.stringify({
  success: true,
  output_path: OUTPUT,
  capability_count: plan.capability_count,
  ready_for_explicit_promotion: true,
  activation_performed: false,
  production_deployment_performed: false,
}, null, 2));
