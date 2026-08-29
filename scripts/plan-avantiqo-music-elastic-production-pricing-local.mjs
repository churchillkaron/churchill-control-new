#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";
import {
  AVANTIQO_OWNED_MEDIA_CERTIFICATION_EVIDENCE_CONTRACT,
  ownedExecutionCertification,
} from "../lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_MUSIC_ELASTIC_PRODUCTION_PRICING_PLAN_V1";
const PRICING_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_PRODUCTION_PRICING_V1";
const ECONOMICS_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_ECONOMICS_BENCHMARK_V1";
const ECONOMICS_RECOVERY_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_ECONOMICS_BILLING_RECOVERY_V1";
const PRODUCTION_CERTIFICATION_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_PRODUCTION_CERTIFICATION_V1";
const HUMAN_REVIEW_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_HUMAN_LISTENING_REVIEW_V1";
const CAPABILITY = "ai.audio.elastic-warp";
const PROVIDER = "avantiqo-audio";
const MODEL = "signalsmith-stretch";
const UNIT = "second";
const CURRENCY = "THB";
const MARKUP_PERCENT = 30;
const QUALITY_PROFILE = "SIGNALSMITH_REVIEWED_TRANSIENT_WARP_V1";
const ENGINE_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_AUDIO_ENGINE_V1";

// Latest authoritative Bank of Thailand commercial-bank USD selling rate
// available when this plan contract was authored.
const FX_THB_PER_USD = 32.9794;
const FX_EFFECTIVE_DATE = "2026-08-27";
const FX_SOURCE = "BANK_OF_THAILAND_FM_FX_001_S3_AVERAGE_SELLING_RATE";
const FX_SOURCE_URL = "https://app.bot.or.th/BTWS_STAT/statistics/ReportPage.aspx?language=eng&reportID=123";

const text = (value) => String(value ?? "").trim();
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round = (value, digits = 12) => {
  const scale = 10 ** digits;
  return Math.round(Number(value) * scale) / scale;
};
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function arg(prefix) {
  return text(process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length));
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function latestTempJson(prefix) {
  const dir = os.tmpdir();
  const candidates = fs.readdirSync(dir)
    .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
    .map((name) => {
      const full = path.join(dir, name);
      return { full, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return candidates[0]?.full || "";
}

function readJson(filePath, missingCode) {
  if (!filePath || !fs.existsSync(filePath)) throw new Error(missingCode);
  const bytes = fs.readFileSync(filePath);
  return { bytes, value: JSON.parse(bytes.toString("utf8")), sha256: sha256(bytes) };
}

function check(failures, name, condition) {
  if (!condition) failures.push(name);
}

if (process.argv.includes("--apply")) {
  throw new Error(`${CONTRACT}_APPLY_FORBIDDEN_PLAN_ONLY`);
}

const economicsPath = path.resolve(
  arg("--economics=") ||
  text(process.env.AVANTIQO_MUSIC_ELASTIC_ECONOMICS_OUTPUT) ||
  latestTempJson("avantiqo-music-elastic-economics-billing-recovered-") ||
  ".",
);
const certificationPath = path.resolve(
  arg("--certification=") ||
  text(process.env.AVANTIQO_MUSIC_ELASTIC_PRODUCTION_CERTIFICATION_OUTPUT) ||
  latestTempJson("avantiqo-music-elastic-production-certification-") ||
  ".",
);

const economics = readJson(
  economicsPath,
  `${CONTRACT}_ECONOMICS_EVIDENCE_REQUIRED`,
);
const certification = readJson(
  certificationPath,
  `${CONTRACT}_PRODUCTION_CERTIFICATION_REQUIRED`,
);

const evidenceFailures = [];
check(evidenceFailures, "economics_success", economics.value?.success === true);
check(evidenceFailures, "economics_contract", text(economics.value?.contract) === ECONOMICS_CONTRACT);
check(evidenceFailures, "economics_recovery_contract", text(economics.value?.recovery_contract) === ECONOMICS_RECOVERY_CONTRACT);
check(evidenceFailures, "economics_capability", text(economics.value?.capability) === CAPABILITY);
check(evidenceFailures, "economics_provider", text(economics.value?.provider) === PROVIDER);
check(evidenceFailures, "economics_model", text(economics.value?.model) === MODEL);
check(evidenceFailures, "economics_quality_profile", text(economics.value?.quality_profile) === QUALITY_PROFILE);
check(evidenceFailures, "economics_measured", economics.value?.economics?.measured === true);
check(evidenceFailures, "economics_certification_ready", economics.value?.economics?.certification_ready === true);
check(evidenceFailures, "economics_not_already_certified", economics.value?.economics?.economics_certified === false);
check(evidenceFailures, "economics_exactly_one_job", economics.value?.controlled_benchmark?.exactly_one_job === true);
check(evidenceFailures, "economics_one_job_count", finite(economics.value?.controlled_benchmark?.controlled_job_count, 0) === 1);
check(evidenceFailures, "economics_no_recovery_job", economics.value?.recovery_provider_job_submitted === false);
check(evidenceFailures, "economics_no_pricing_mutation", economics.value?.pricing_mutation_performed === false);
check(evidenceFailures, "economics_no_database_mutation", economics.value?.database_mutation_performed === false);
check(evidenceFailures, "economics_no_deploy", economics.value?.production_deploy_performed === false);
check(evidenceFailures, "economics_endpoint_min_zero", finite(economics.value?.current_verified_rest_state?.workers_min, -1) === 0);
check(evidenceFailures, "economics_endpoint_max_zero", finite(economics.value?.current_verified_rest_state?.workers_max, -1) === 0);
check(evidenceFailures, "economics_endpoint_active_zero", finite(economics.value?.current_verified_rest_state?.active_workers, -1) === 0);
check(evidenceFailures, "economics_queue_zero", finite(economics.value?.current_verified_rest_state?.jobs_in_queue, -1) === 0);
check(evidenceFailures, "economics_progress_zero", finite(economics.value?.current_verified_rest_state?.jobs_in_progress, -1) === 0);

check(evidenceFailures, "certification_success", certification.value?.success === true);
check(evidenceFailures, "certification_contract", text(certification.value?.contract) === PRODUCTION_CERTIFICATION_CONTRACT);
check(evidenceFailures, "certification_capability", text(certification.value?.capability) === CAPABILITY);
check(evidenceFailures, "certification_provider", text(certification.value?.provider) === PROVIDER);
check(evidenceFailures, "certification_model", text(certification.value?.model) === MODEL);
check(evidenceFailures, "certification_quality_profile", text(certification.value?.quality_profile) === QUALITY_PROFILE);
check(evidenceFailures, "certification_engine", text(certification.value?.engine_contract) === ENGINE_CONTRACT);
check(evidenceFailures, "certification_production", certification.value?.production_certified === true);
check(evidenceFailures, "certification_human_pass", text(certification.value?.evidence?.human_review_decision) === "PASS");
check(evidenceFailures, "certification_human_checks", certification.value?.evidence?.all_listening_checks_passed === true);
check(evidenceFailures, "certification_provider_parked", certification.value?.certification_gates?.provider_parked_after_certification === true);
check(evidenceFailures, "certification_no_provider_activation", certification.value?.provider_activation_performed === false);
check(evidenceFailures, "certification_no_endpoint_mutation", certification.value?.endpoint_mutation_performed === false);
check(evidenceFailures, "certification_no_provider_job", certification.value?.provider_job_submitted === false);
check(evidenceFailures, "certification_no_deploy", certification.value?.production_deploy_performed === false);

if (evidenceFailures.length) {
  throw new Error(`${CONTRACT}_EVIDENCE_INVALID:${evidenceFailures.join(",")}`);
}

const humanReviewPath = path.resolve(text(certification.value?.evidence?.human_review_path) || ".");
const humanReview = readJson(
  humanReviewPath,
  `${CONTRACT}_HUMAN_REVIEW_EVIDENCE_REQUIRED`,
);
const humanFailures = [];
check(humanFailures, "review_success", humanReview.value?.success === true);
check(humanFailures, "review_contract", text(humanReview.value?.contract) === HUMAN_REVIEW_CONTRACT);
check(humanFailures, "review_decision", text(humanReview.value?.decision).toUpperCase() === "PASS");
check(humanFailures, "review_complete", humanReview.value?.human_listening_review_complete === true);
check(humanFailures, "review_attestation", humanReview.value?.human_listener_attestation === true);
check(humanFailures, "review_checks", humanReview.value?.all_listening_checks_passed === true);
check(humanFailures, "review_certification_ready", humanReview.value?.certification_ready === true);
check(humanFailures, "review_not_provider_activation", humanReview.value?.provider_activation_performed === false);
check(humanFailures, "review_no_endpoint_mutation", humanReview.value?.endpoint_mutation_performed === false);
check(humanFailures, "review_no_provider_job", humanReview.value?.provider_job_submitted === false);
check(humanFailures, "review_timestamp", Boolean(text(humanReview.value?.generated_at)) && Number.isFinite(Date.parse(text(humanReview.value?.generated_at))));
check(humanFailures, "review_hash_binding", text(certification.value?.evidence?.human_review_sha256) === humanReview.sha256);
if (humanFailures.length) {
  throw new Error(`${CONTRACT}_HUMAN_REVIEW_INVALID:${humanFailures.join(",")}`);
}

const supplierUsdPerSecond = finite(economics.value?.economics?.supplier_compute_usd_per_audio_second, null);
const supplierUsdPerMinute = finite(economics.value?.economics?.supplier_compute_usd_per_audio_minute, null);
const billedSupplierUsd = finite(economics.value?.economics?.billed_supplier_compute_usd, null);
const billingAmountUsd = finite(economics.value?.billing_evidence?.amount_usd, null);
const billingTimeMs = finite(economics.value?.billing_evidence?.time_billed_ms, null);
if (!(supplierUsdPerSecond > 0) || !(supplierUsdPerMinute > 0) || !(billedSupplierUsd > 0) || !(billingAmountUsd > 0) || !(billingTimeMs > 0)) {
  throw new Error(`${CONTRACT}_SUPPLIER_ECONOMICS_INVALID`);
}
if (Math.abs(billedSupplierUsd - billingAmountUsd) > 1e-9) {
  throw new Error(`${CONTRACT}_BILLING_AMOUNT_BINDING_INVALID`);
}

const supplierThbPerSecond = supplierUsdPerSecond * FX_THB_PER_USD;
const supplierThbPerMinute = supplierThbPerSecond * 60;
const customerThbPerSecond = supplierThbPerSecond * (1 + MARKUP_PERCENT / 100);
const customerThbPerMinute = customerThbPerSecond * 60;
const reviewer = text(process.env.AVANTIQO_MUSIC_ELASTIC_HUMAN_QUALITY_REVIEWER);
const reviewedAt = text(humanReview.value.generated_at);

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: existingRows, error: existingError } = await supabase
  .from("provider_pricing")
  .select("id,provider,model,capability,unit,cost_per_unit,currency,markup_percent,active,metadata,created_at,updated_at")
  .eq("provider", PROVIDER)
  .eq("capability", CAPABILITY)
  .eq("model", MODEL)
  .order("created_at", { ascending: false });
if (existingError) throw new Error(`${CONTRACT}_READ_EXISTING_PRICING_FAILED:${existingError.message}`);
if ((existingRows || []).length > 1) throw new Error(`${CONTRACT}_DUPLICATE_EXISTING_PRICING_ROWS:${existingRows.length}`);

const metadata = {
  pricing_contract: PRICING_CONTRACT,
  pricing_status: "PRODUCTION_CERTIFIED",
  owned_inference: true,
  benchmark_certified: true,
  economics_certified: true,
  economics_measured: true,
  model_license_verified: true,
  runtime_compatible: true,
  recalibration_required: false,
  human_quality_certified: true,
  human_quality_evidence_contract: AVANTIQO_OWNED_MEDIA_CERTIFICATION_EVIDENCE_CONTRACT,
  human_quality_reviewer: reviewer || null,
  human_quality_reviewed_at: reviewedAt,
  certified_capability: CAPABILITY,
  certified_model: MODEL,
  quality_profile: QUALITY_PROFILE,
  engine_contract: ENGINE_CONTRACT,
  customer_price_policy: "SUPPLIER_COST_PLUS_MARKUP",
  customer_markup_percent: MARKUP_PERCENT,
  supplier_cost_source: ECONOMICS_CONTRACT,
  supplier_cost_recovery_contract: ECONOMICS_RECOVERY_CONTRACT,
  supplier_cost_evidence_path: economicsPath,
  supplier_cost_evidence_sha256: economics.sha256,
  production_certification_contract: PRODUCTION_CERTIFICATION_CONTRACT,
  production_certification_path: certificationPath,
  production_certification_sha256: certification.sha256,
  human_review_source_contract: HUMAN_REVIEW_CONTRACT,
  human_review_source_path: humanReviewPath,
  human_review_source_sha256: humanReview.sha256,
  billing_amount_usd: round(billingAmountUsd, 12),
  billing_time_billed_ms: billingTimeMs,
  supplier_cost_usd_per_second: round(supplierUsdPerSecond, 12),
  supplier_cost_usd_per_audio_minute: round(supplierUsdPerMinute, 10),
  supplier_cost_thb_per_second: round(supplierThbPerSecond, 12),
  supplier_cost_thb_per_audio_minute: round(supplierThbPerMinute, 8),
  customer_price_thb_per_second: round(customerThbPerSecond, 12),
  customer_price_thb_per_audio_minute: round(customerThbPerMinute, 8),
  fx_source: FX_SOURCE,
  fx_source_url: FX_SOURCE_URL,
  fx_effective_date: FX_EFFECTIVE_DATE,
  fx_thb_per_usd: FX_THB_PER_USD,
  billing_currency: "USD",
  pricing_currency: CURRENCY,
  unit: UNIT,
  automatic_apply_forbidden: true,
  explicit_musician_warp_plan_required: true,
  raw_reasoning_persisted: false,
  production_routing_allowed: Boolean(reviewer),
  pricing_promotion_performed: false,
  production_web_deploy: false,
};

const proposedRow = {
  provider: PROVIDER,
  model: MODEL,
  input_cost_per_1m: 0,
  output_cost_per_1m: 0,
  markup_percent: MARKUP_PERCENT,
  active: true,
  capability: CAPABILITY,
  unit: UNIT,
  cost_per_unit: round(supplierThbPerSecond, 12),
  currency: CURRENCY,
  metadata,
};

const providerForCertification = {
  id: PROVIDER,
  metadata: {
    configured_foundation_model: MODEL,
    foundation_models: [MODEL],
  },
};
const ownedCertification = ownedExecutionCertification({
  provider: providerForCertification,
  capability: CAPABILITY,
  pricing: proposedRow,
});

const blockers = [];
if (!reviewer) blockers.push("HUMAN_QUALITY_REVIEWER_REQUIRED");
if (!ownedCertification?.model?.eligible) blockers.push(ownedCertification?.model?.reason || "OWNED_MODEL_CERTIFICATION_FAILED");
if (!ownedCertification?.economics?.eligible) blockers.push(ownedCertification?.economics?.reason || "OWNED_PRICING_CERTIFICATION_FAILED");
const promotionReady = blockers.length === 0;
const existing = (existingRows || [])[0] || null;
const operation = existing ? "UPDATE_EXISTING_EXACT_ELASTIC_ROW" : "INSERT_NEW_ELASTIC_ROW";

const plan = {
  success: true,
  contract: CONTRACT,
  mode: "PLAN",
  generated_at: new Date().toISOString(),
  capability: CAPABILITY,
  provider: PROVIDER,
  model: MODEL,
  evidence: {
    economics_path: economicsPath,
    economics_sha256: economics.sha256,
    production_certification_path: certificationPath,
    production_certification_sha256: certification.sha256,
    human_review_path: humanReviewPath,
    human_review_sha256: humanReview.sha256,
  },
  economics: {
    supplier_usd_per_second: round(supplierUsdPerSecond, 12),
    supplier_usd_per_audio_minute: round(supplierUsdPerMinute, 10),
    supplier_thb_per_second: round(supplierThbPerSecond, 12),
    supplier_thb_per_audio_minute: round(supplierThbPerMinute, 8),
    customer_thb_per_second: round(customerThbPerSecond, 12),
    customer_thb_per_audio_minute: round(customerThbPerMinute, 8),
    markup_percent: MARKUP_PERCENT,
    fx_thb_per_usd: FX_THB_PER_USD,
    fx_effective_date: FX_EFFECTIVE_DATE,
    fx_source: FX_SOURCE,
  },
  live_database_read: {
    existing_exact_row_count: (existingRows || []).length,
    existing_row_id: existing?.id || null,
    existing_row_active: existing?.active ?? null,
    proposed_operation: operation,
  },
  proposed_provider_pricing_row: proposedRow,
  owned_execution_certification: ownedCertification,
  promotion_ready: promotionReady,
  blockers,
  human_quality_reviewer_bound: Boolean(reviewer),
  reviewer_value_written_to_database: false,
  pricing_activation_performed: false,
  database_mutation_performed: false,
  organization_service_mutation_performed: false,
  provider_routing_mutation_performed: false,
  provider_job_submitted: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
  next_action: promotionReady
    ? "BUILD_EXPLICIT_ELASTIC_PRODUCTION_PRICING_APPLY_GATE"
    : "BIND_EXPLICIT_HUMAN_QUALITY_REVIEWER_THEN_RERUN_PLAN",
};

const outputPath = path.resolve(
  text(process.env.AVANTIQO_MUSIC_ELASTIC_PRICING_PLAN_OUTPUT) ||
  path.join(os.tmpdir(), `avantiqo-music-elastic-production-pricing-plan-${Date.now()}.json`),
);
fs.writeFileSync(outputPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

console.log(JSON.stringify(plan, null, 2));
console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_PRICING_PLAN=PASS");
console.log(`AVANTIQO_MUSIC_ELASTIC_PRODUCTION_PRICING_PROMOTION_READY=${promotionReady ? "true" : "false"}`);
console.log(`AVANTIQO_MUSIC_ELASTIC_HUMAN_QUALITY_REVIEWER_BOUND=${reviewer ? "true" : "false"}`);
for (const blocker of blockers) console.log(`AVANTIQO_MUSIC_ELASTIC_PRODUCTION_PRICING_BLOCKER=${blocker}`);
console.log("AVANTIQO_MUSIC_ELASTIC_PRICING_ACTIVATION_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_DATABASE_MUTATION_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_PROVIDER_JOB_SUBMITTED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_ENDPOINT_MUTATION_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_DEPLOY_PERFORMED=false");
console.log(`AVANTIQO_MUSIC_ELASTIC_PRODUCTION_PRICING_PLAN_OUTPUT=${outputPath}`);
console.log(`AVANTIQO_MUSIC_ELASTIC_NEXT=${plan.next_action}`);
