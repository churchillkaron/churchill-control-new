#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { readFile } from "node:fs/promises";

import { ownedExecutionCertification } from "../lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js";

const CONTRACT = "AVANTIQO_VOICE_PRODUCTION_PRICING_FROM_OWNED_PROOF_V1";
const ECONOMICS_CONTRACT = "AVANTIQO_VOICE_COLD_START_BILLING_FLOOR_ECONOMICS_V1";
const PROVIDER = "avantiqo-voice";
const CAPABILITY = "ai.text.to.speech";
const MODEL = "resemble-ai/chatterbox:multilingual-v3";
const LANE = "voice-tts";
const ENDPOINT_ID = "a5a2evletdphds";
const ENDPOINT_NAME = "avantiqo-voice-tts-v1";
const PRODUCTION_PROJECT_REF = "vfsjqabpkcbiuerhzugk";
const APPROVAL_ENV = "AVANTIQO_VOICE_PRODUCTION_PRICING_APPLY_APPROVED";
const ROUTE_PATH = "app/api/operator/speak/jobs/route.js";
const MIN_BILLABLE_MINUTES = 0.02;
const MAX_CONFIGURED_SERVERLESS_GPU_USD_PER_HOUR = 3.49;
const GPU_PRICE_SOURCE = "https://www.runpod.io/pricing";
const GPU_PRICE_OBSERVED_AT = "2026-08-29T13:03:00Z";
const USD_TO_THB = 33.15;
const FX_SOURCE = "CURRENT_USD_THB_MARKET_RATE_SNAPSHOT";
const FX_OBSERVED_AT = "2026-08-29T13:03:00Z";
const MARKUP_PERCENT = 30;

const text = (value) => String(value ?? "").trim();
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round = (value, digits = 10) => {
  const scale = 10 ** digits;
  return Math.round(Number(value) * scale) / scale;
};

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function approved(name) {
  if (text(process.env[name]).toUpperCase() !== "YES") {
    throw new Error(`${name}=YES_REQUIRED`);
  }
}

function providerForCertification() {
  return {
    id: PROVIDER,
    metadata: {
      configured_foundation_model: MODEL,
      foundation_models: [MODEL],
    },
  };
}

approved(APPROVAL_ENV);

const routeSource = await readFile(ROUTE_PATH, "utf8");
if (!routeSource.includes("Math.max(0.02, Math.min(10, words / 150))")) {
  throw new Error(`${CONTRACT}_BILLING_FLOOR_SOURCE_MISMATCH`);
}

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
let projectRef = "";
try {
  projectRef = new URL(supabaseUrl).hostname.split(".")[0];
} catch {
  throw new Error(`${CONTRACT}_SUPABASE_URL_INVALID`);
}
if (projectRef !== PRODUCTION_PROJECT_REF) {
  throw new Error(`${CONTRACT}_PRODUCTION_PROJECT_REF_MISMATCH:${projectRef || "UNKNOWN"}`);
}

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: pricingRows, error: pricingError } = await supabase
  .from("provider_pricing")
  .select("*")
  .eq("provider", PROVIDER)
  .eq("capability", CAPABILITY)
  .eq("model", MODEL)
  .order("created_at", { ascending: false });
if (pricingError) throw new Error(`${CONTRACT}_PRICING_READ_FAILED:${pricingError.message}`);
if (!Array.isArray(pricingRows) || pricingRows.length !== 1) {
  throw new Error(`${CONTRACT}_EXACT_PRICING_ROW_REQUIRED:${Array.isArray(pricingRows) ? pricingRows.length : 0}`);
}
const before = pricingRows[0];
if (before.active !== true || text(before.unit) !== "minute") {
  throw new Error(`${CONTRACT}_ACTIVE_MINUTE_PRICING_REQUIRED`);
}
const currentMetadata = before.metadata && typeof before.metadata === "object" ? before.metadata : {};
if (
  currentMetadata.owned_inference !== true ||
  currentMetadata.runtime_certified !== true ||
  currentMetadata.model_license_verified !== true ||
  currentMetadata.external_voice_fallback_allowed !== false
) {
  throw new Error(`${CONTRACT}_OWNED_RUNTIME_CERTIFICATION_REQUIRED`);
}

const existingCertification = ownedExecutionCertification({
  provider: providerForCertification(),
  capability: CAPABILITY,
  pricing: before,
});
if (existingCertification?.eligible === true) {
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    already_certified: true,
    pricing_row_id: before.id,
    provider: PROVIDER,
    capability: CAPABILITY,
    model: MODEL,
    database_mutation_performed: false,
    provider_job_submitted: false,
    endpoint_mutation_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }, null, 2));
  process.exit(0);
}

const { data: proof, error: proofError } = await supabase
  .from("avantiqo_voice_owned_certification_runs")
  .select("id,contract,success,tts_endpoint_id,tts_endpoint_name,tts_lease_id,tts_provider_job_id,tts_status,tts_audio_bytes,tts_sample_rate,workers_restored_0_0,external_provider_used,raw_audio_persisted,completed_at")
  .eq("success", true)
  .eq("tts_endpoint_id", ENDPOINT_ID)
  .eq("tts_endpoint_name", ENDPOINT_NAME)
  .eq("tts_status", "COMPLETED")
  .eq("workers_restored_0_0", true)
  .eq("external_provider_used", false)
  .eq("raw_audio_persisted", false)
  .order("completed_at", { ascending: false })
  .limit(1)
  .maybeSingle();
if (proofError) throw new Error(`${CONTRACT}_PROOF_READ_FAILED:${proofError.message}`);
if (
  !proof?.id ||
  !proof?.tts_lease_id ||
  !text(proof?.tts_provider_job_id) ||
  finite(proof?.tts_audio_bytes, 0) <= 1000 ||
  finite(proof?.tts_sample_rate, 0) !== 24000
) {
  throw new Error(`${CONTRACT}_OWNED_TTS_PROOF_INVALID`);
}

const { data: lease, error: leaseError } = await supabase
  .from("avantiqo_voice_runpod_leases")
  .select("id,contract,lane,endpoint_id,endpoint_name,state,acquired_at,released_at")
  .eq("id", proof.tts_lease_id)
  .maybeSingle();
if (leaseError) throw new Error(`${CONTRACT}_LEASE_READ_FAILED:${leaseError.message}`);
if (
  !lease ||
  text(lease.lane) !== LANE ||
  text(lease.endpoint_id) !== ENDPOINT_ID ||
  text(lease.endpoint_name) !== ENDPOINT_NAME ||
  text(lease.state).toUpperCase() !== "RELEASED" ||
  !lease.acquired_at ||
  !lease.released_at
) {
  throw new Error(`${CONTRACT}_RELEASED_SAFE_LEASE_REQUIRED`);
}

const leaseSeconds = (Date.parse(lease.released_at) - Date.parse(lease.acquired_at)) / 1000;
if (!(leaseSeconds > 0 && leaseSeconds <= 1800)) {
  throw new Error(`${CONTRACT}_LEASE_DURATION_INVALID`);
}

const coldStartCostUsd = (MAX_CONFIGURED_SERVERLESS_GPU_USD_PER_HOUR / 3600) * leaseSeconds;
const coldStartCostThb = coldStartCostUsd * USD_TO_THB;
const supplierCostThbPerBilledMinute = coldStartCostThb / MIN_BILLABLE_MINUTES;
const customerPriceThbPerBilledMinute = supplierCostThbPerBilledMinute * (1 + MARKUP_PERCENT / 100);
if (
  !(coldStartCostUsd > 0) ||
  !(coldStartCostThb > 0) ||
  !(supplierCostThbPerBilledMinute > 0) ||
  !(customerPriceThbPerBilledMinute > supplierCostThbPerBilledMinute)
) {
  throw new Error(`${CONTRACT}_ECONOMICS_INVALID`);
}

const certifiedAt = new Date().toISOString();
const economics = {
  contract: ECONOMICS_CONTRACT,
  runtime_certification_run_id: proof.id,
  runtime_certification_contract: proof.contract,
  lease_id: lease.id,
  provider_job_id: proof.tts_provider_job_id,
  lease_seconds: round(leaseSeconds, 6),
  certified_audio_bytes: finite(proof.tts_audio_bytes, 0),
  certified_sample_rate: finite(proof.tts_sample_rate, 0),
  billing_quantity_floor_minutes: MIN_BILLABLE_MINUTES,
  billing_quantity_source: ROUTE_PATH,
  billing_quantity_formula: "max(0.02,min(10,words/150))",
  max_configured_serverless_gpu_usd_per_hour: MAX_CONFIGURED_SERVERLESS_GPU_USD_PER_HOUR,
  gpu_price_source: GPU_PRICE_SOURCE,
  gpu_price_observed_at: GPU_PRICE_OBSERVED_AT,
  usd_to_thb: USD_TO_THB,
  fx_source: FX_SOURCE,
  fx_observed_at: FX_OBSERVED_AT,
  cold_start_cost_usd: round(coldStartCostUsd, 10),
  cold_start_cost_thb: round(coldStartCostThb, 10),
  supplier_cost_thb_per_billed_minute: round(supplierCostThbPerBilledMinute, 10),
  customer_price_thb_per_billed_minute: round(customerPriceThbPerBilledMinute, 10),
  markup_percent: MARKUP_PERCENT,
  cold_start_included: true,
  minimum_billable_quantity_cost_coverage: true,
  historical_runpod_job_retention_required: false,
  external_provider_used: false,
  raw_audio_persisted: false,
  certified_at: certifiedAt,
};

const finalMetadata = {
  ...currentMetadata,
  pricing_status: "PRODUCTION_CERTIFIED",
  owned_inference: true,
  runtime_compatible: true,
  runtime_certified: true,
  benchmark_certified: true,
  economics_certified: true,
  model_license_verified: true,
  recalibration_required: false,
  production_routing_allowed: true,
  external_voice_fallback_allowed: false,
  owned_only_required: true,
  commercial_pricing_certified: true,
  certified_capability: CAPABILITY,
  certified_model: MODEL,
  benchmark_contract: ECONOMICS_CONTRACT,
  benchmark_certification_run_id: proof.id,
  economics_contract: ECONOMICS_CONTRACT,
  economics_certified_at: certifiedAt,
  internal_gpu_cost_status: "MEASURED_COLD_START_SAFE_LEASE_ENVELOPE",
  supplier_cost_source: ECONOMICS_CONTRACT,
  supplier_cost_thb_per_billed_minute: round(supplierCostThbPerBilledMinute, 10),
  customer_price_thb_per_billed_minute: round(customerPriceThbPerBilledMinute, 10),
  customer_markup_percent: MARKUP_PERCENT,
  pricing_promotion_performed: true,
  pricing_promotion_applied_at: certifiedAt,
  customer_price_policy: "OWNED_COLD_START_MINIMUM_BILLABLE_QUANTITY_PLUS_MARKUP",
  voice_cold_start_economics: economics,
};

const candidate = {
  ...before,
  active: true,
  unit: "minute",
  cost_per_unit: round(supplierCostThbPerBilledMinute, 10),
  markup_percent: MARKUP_PERCENT,
  metadata: finalMetadata,
};
const candidateCertification = ownedExecutionCertification({
  provider: providerForCertification(),
  capability: CAPABILITY,
  pricing: candidate,
});
if (candidateCertification?.eligible !== true) {
  throw new Error(`${CONTRACT}_CANDIDATE_NOT_CERTIFIED:${candidateCertification?.reason || "UNKNOWN"}`);
}

const { data: updated, error: updateError } = await supabase
  .from("provider_pricing")
  .update({
    active: true,
    unit: "minute",
    cost_per_unit: round(supplierCostThbPerBilledMinute, 10),
    markup_percent: MARKUP_PERCENT,
    metadata: finalMetadata,
    updated_at: certifiedAt,
  })
  .eq("id", before.id)
  .select("*")
  .single();
if (updateError) throw new Error(`${CONTRACT}_UPDATE_FAILED:${updateError.message}`);

const readbackCertification = ownedExecutionCertification({
  provider: providerForCertification(),
  capability: CAPABILITY,
  pricing: updated,
});
if (readbackCertification?.eligible !== true) {
  throw new Error(`${CONTRACT}_READBACK_NOT_CERTIFIED:${readbackCertification?.reason || "UNKNOWN"}`);
}
if (
  updated.active !== true ||
  text(updated.unit) !== "minute" ||
  text(updated?.metadata?.pricing_status) !== "PRODUCTION_CERTIFIED" ||
  updated?.metadata?.external_voice_fallback_allowed !== false ||
  updated?.metadata?.production_routing_allowed !== true ||
  text(updated?.metadata?.economics_contract) !== ECONOMICS_CONTRACT
) {
  throw new Error(`${CONTRACT}_READBACK_INVALID`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  provider: PROVIDER,
  capability: CAPABILITY,
  model: MODEL,
  pricing_row_id: updated.id,
  pricing_status: updated.metadata.pricing_status,
  benchmark_certified: updated.metadata.benchmark_certified,
  economics_certified: updated.metadata.economics_certified,
  recalibration_required: updated.metadata.recalibration_required,
  billing_quantity_floor_minutes: MIN_BILLABLE_MINUTES,
  lease_seconds: round(leaseSeconds, 6),
  cold_start_cost_usd: round(coldStartCostUsd, 10),
  cold_start_cost_thb: round(coldStartCostThb, 10),
  supplier_cost_thb_per_billed_minute: round(supplierCostThbPerBilledMinute, 10),
  customer_price_thb_per_billed_minute: round(customerPriceThbPerBilledMinute, 10),
  markup_percent: MARKUP_PERCENT,
  historical_runpod_job_retention_required: false,
  pricing_activation_performed: false,
  database_mutation_performed: true,
  provider_job_submitted: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
  secrets_printed: false,
  owned_execution_certification: readbackCertification,
}, null, 2));

console.log("AVANTIQO_VOICE_PRODUCTION_PRICING_FROM_OWNED_PROOF=PASS");
console.log("AVANTIQO_VOICE_PROVIDER_JOB_SUBMITTED=false");
console.log("AVANTIQO_VOICE_ENDPOINT_MUTATION_PERFORMED=false");
console.log("AVANTIQO_VOICE_PRODUCTION_DEPLOY_PERFORMED=false");
