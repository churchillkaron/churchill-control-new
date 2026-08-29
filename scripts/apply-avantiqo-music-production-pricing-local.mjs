#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";
import { ownedExecutionCertification } from "../lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_MUSIC_PRODUCTION_PRICING_APPLY_V1";
const PLAN_CONTRACT = "AVANTIQO_MUSIC_PROMOTION_PLAN_V1";
const PROVIDER = "avantiqo-audio";
const CAPABILITY = "ai.music.generate";
const MODEL = "ACE-Step/Ace-Step1.5";
const MODEL_VARIANT = "acestep-v15-xl-turbo";
const QUALITY_PROFILE = "ACE_STEP_1_5_XL_TURBO_1_7B_LM_V1";
const LM_MODEL = "acestep-5Hz-lm-1.7B";
const LM_BACKEND = "vllm";
const HUMAN_EVIDENCE_CONTRACT = "AVANTIQO_OWNED_MEDIA_CERTIFICATION_EVIDENCE_V1";
const PRODUCTION_PROJECT_REF = "vfsjqabpkcbiuerhzugk";
const APPROVAL_ENV = "AVANTIQO_MUSIC_PRODUCTION_PRICING_APPLY_APPROVED";

const text = (value) => String(value ?? "").trim();
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const round = (value, digits = 10) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

function approved(name) {
  if (text(process.env[name]).toUpperCase() !== "YES") throw new Error(`${name}=YES_REQUIRED`);
}

function arg(prefix) {
  return text(process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length));
}

function validIso(value) {
  const candidate = text(value);
  return Boolean(candidate && Number.isFinite(Date.parse(candidate)));
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

function requireCertified(row, phase) {
  const certification = ownedExecutionCertification({
    provider: providerForCertification(),
    capability: CAPABILITY,
    pricing: row,
  });
  if (certification?.eligible !== true) {
    throw new Error(`${CONTRACT}_${phase}_CERTIFICATION_FAILED:${certification?.reason || "UNKNOWN"}`);
  }
  return certification;
}

approved(APPROVAL_ENV);

const planPath = path.resolve(
  arg("--plan=") ||
  process.env.AVANTIQO_MUSIC_PROMOTION_PLAN_OUTPUT ||
  "/tmp/avantiqo-music-promotion-plan.json",
);
if (!fs.existsSync(planPath)) throw new Error(`${CONTRACT}_PLAN_FILE_NOT_FOUND`);

const planBytes = fs.readFileSync(planPath);
const planSha = sha256(planBytes);
const plan = JSON.parse(planBytes.toString("utf8"));
const evidence = plan?.evidence || {};
const promoted = plan?.required_pricing_metadata_after_explicit_promotion || {};

const planFailures = [];
const check = (name, condition) => { if (!condition) planFailures.push(name); };
check("contract", text(plan?.contract) === PLAN_CONTRACT);
check("provider", text(plan?.provider) === PROVIDER);
check("capability", text(plan?.capability) === CAPABILITY);
check("model", text(plan?.foundation_model) === MODEL);
check("variant", text(plan?.model_variant) === MODEL_VARIANT);
check("quality_profile", text(plan?.quality_profile) === QUALITY_PROFILE);
check("lm_required", plan?.ace_step_lm_required === true);
check("lm_model", text(plan?.ace_step_lm_model) === LM_MODEL);
check("lm_backend", text(plan?.ace_step_lm_backend) === LM_BACKEND);
check("thinking", plan?.thinking_required === true);
check("benchmark_passed", evidence?.benchmark_passed === true);
check("economics_measured", evidence?.economics_measured === true);
check("fresh_usd_per_second", finite(evidence?.measured_compute_usd_per_audio_second, 0) > 0);
check("fresh_usd_per_minute", finite(evidence?.measured_compute_usd_per_audio_minute, 0) > 0);
check("human_quality", evidence?.human_quality_certified === true);
check("human_reviewer", Boolean(text(evidence?.human_quality_reviewer)));
check("human_reviewed_at", validIso(evidence?.human_quality_reviewed_at));
check("human_evidence_contract", text(evidence?.human_quality_evidence_contract) === HUMAN_EVIDENCE_CONTRACT);
check("pricing_status", text(promoted?.pricing_status) === "PRODUCTION_CERTIFIED");
check("owned_inference", promoted?.owned_inference === true);
check("benchmark_certified", promoted?.benchmark_certified === true);
check("economics_certified", promoted?.economics_certified === true);
check("human_quality_certified", promoted?.human_quality_certified === true);
check("certified_capability", text(promoted?.certified_capability) === CAPABILITY);
check("certified_model", text(promoted?.certified_model) === MODEL);
check("certified_variant", text(promoted?.certified_model_variant) === MODEL_VARIANT);
check("promoted_quality_profile", text(promoted?.quality_profile) === QUALITY_PROFILE);
check("promoted_lm_required", promoted?.ace_step_lm_required === true);
check("promoted_lm_model", text(promoted?.ace_step_lm_model) === LM_MODEL);
check("promoted_lm_backend", text(promoted?.ace_step_lm_backend) === LM_BACKEND);
check("promoted_thinking", promoted?.thinking_required === true);
check("license", promoted?.model_license_verified === true);
check("runtime", promoted?.runtime_compatible === true);
check("recalibration_clear", promoted?.recalibration_required === false);
check("routing_allowed", promoted?.production_routing_allowed === true);
check("pricing_review_ready", plan?.ready_for_explicit_pricing_review === true);
check("automatic_activation_forbidden", plan?.automatic_activation_forbidden === true);
check("prior_activation_false", plan?.activation_performed === false);
check("prior_pricing_mutation_false", plan?.pricing_mutation_performed === false);
check("prior_deploy_false", plan?.production_deployment_performed === false);
if (planFailures.length) throw new Error(`${CONTRACT}_PLAN_INVALID:${planFailures.join(",")}`);

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

const { data: rows, error: readError } = await supabase
  .from("provider_pricing")
  .select("*")
  .eq("provider", PROVIDER)
  .eq("capability", CAPABILITY)
  .eq("model", MODEL)
  .order("created_at", { ascending: false });
if (readError) throw new Error(`${CONTRACT}_READ_FAILED:${readError.message}`);
if (!Array.isArray(rows) || rows.length !== 1) {
  throw new Error(`${CONTRACT}_EXACT_PRICING_ROW_COUNT_INVALID:${Array.isArray(rows) ? rows.length : 0}`);
}

const before = rows[0];
if (before.active !== false) throw new Error(`${CONTRACT}_CURRENT_ROW_MUST_BE_INACTIVE`);
if (text(before.unit) !== "second") throw new Error(`${CONTRACT}_CURRENT_UNIT_INVALID`);
if (text(before.currency) !== "THB") throw new Error(`${CONTRACT}_CURRENT_CURRENCY_INVALID`);
const oldCostPerUnit = finite(before.cost_per_unit, null);
const oldMarkupPercent = finite(before.markup_percent, null);
if (!(oldCostPerUnit > 0)) throw new Error(`${CONTRACT}_CURRENT_COST_PER_UNIT_REQUIRED`);
if (!(oldMarkupPercent >= 0)) throw new Error(`${CONTRACT}_CURRENT_MARKUP_INVALID`);

const currentMetadata = before.metadata && typeof before.metadata === "object" ? before.metadata : {};
if (currentMetadata.owned_inference !== true) throw new Error(`${CONTRACT}_CURRENT_ROW_NOT_OWNED`);
if (currentMetadata.production_routing_allowed === true) {
  throw new Error(`${CONTRACT}_CURRENT_ROW_ALREADY_ROUTABLE_WITHOUT_CERTIFICATION`);
}

const fxToThb = finite(currentMetadata.fx_to_thb, null);
if (!(fxToThb > 0)) throw new Error(`${CONTRACT}_CURRENT_FX_TO_THB_REQUIRED`);
const freshUsdPerSecond = finite(evidence.measured_compute_usd_per_audio_second, null);
const freshUsdPerMinute = finite(evidence.measured_compute_usd_per_audio_minute, null);
if (!(freshUsdPerSecond > 0) || !(freshUsdPerMinute > 0)) {
  throw new Error(`${CONTRACT}_FRESH_ECONOMICS_REQUIRED`);
}

const existingCustomerPriceThbPerSecond = round(oldCostPerUnit * (1 + (oldMarkupPercent / 100)), 10);
const freshCostPerUnitThb = round(freshUsdPerSecond * fxToThb, 10);
if (!(freshCostPerUnitThb > 0)) throw new Error(`${CONTRACT}_FRESH_THB_COST_INVALID`);
if (freshCostPerUnitThb > existingCustomerPriceThbPerSecond) {
  throw new Error(`${CONTRACT}_FRESH_COST_EXCEEDS_CURRENT_CUSTOMER_PRICE_EXPLICIT_REPRICING_REQUIRED`);
}
const freshMarkupPercent = round(((existingCustomerPriceThbPerSecond / freshCostPerUnitThb) - 1) * 100, 6);
if (!(freshMarkupPercent >= 0)) throw new Error(`${CONTRACT}_FRESH_MARKUP_INVALID`);

const appliedAt = new Date().toISOString();
const finalMetadata = {
  ...currentMetadata,
  ...promoted,
  pricing_status: "PRODUCTION_CERTIFIED",
  owned_inference: true,
  benchmark_certified: true,
  economics_certified: true,
  human_quality_certified: true,
  human_quality_evidence_contract: HUMAN_EVIDENCE_CONTRACT,
  human_quality_reviewer: text(evidence.human_quality_reviewer),
  human_quality_reviewed_at: text(evidence.human_quality_reviewed_at),
  certified_capability: CAPABILITY,
  certified_model: MODEL,
  certified_model_variant: MODEL_VARIANT,
  model_variant: MODEL_VARIANT,
  quality_profile: QUALITY_PROFILE,
  ace_step_lm_required: true,
  ace_step_lm_enabled: true,
  ace_step_lm_model: LM_MODEL,
  ace_step_lm_backend: LM_BACKEND,
  thinking_required: true,
  thinking_enabled: true,
  model_license_verified: true,
  runtime_compatible: true,
  recalibration_required: false,
  production_routing_allowed: true,
  supplier_cost_source: text(evidence.benchmark_contract) || "AVANTIQO_MUSIC_CERTIFICATION_BENCHMARK_V3",
  supplier_cost_benchmark_id: text(evidence.benchmark_id) || null,
  supplier_cost_usd_per_second: freshUsdPerSecond,
  supplier_cost_usd_per_audio_minute: freshUsdPerMinute,
  measured_compute_usd_per_audio_second: freshUsdPerSecond,
  measured_compute_usd_per_audio_minute: freshUsdPerMinute,
  customer_price_thb_per_second: existingCustomerPriceThbPerSecond,
  customer_price_preserved_during_certification: true,
  provider_certification_performed: true,
  pricing_promotion_performed: true,
  pricing_promotion_plan_contract: PLAN_CONTRACT,
  pricing_promotion_plan_sha256: planSha,
  pricing_promotion_applied_at: appliedAt,
};

const staged = {
  ...before,
  cost_per_unit: freshCostPerUnitThb,
  markup_percent: freshMarkupPercent,
  metadata: finalMetadata,
  active: false,
};
const stagedCertification = requireCertified(staged, "INACTIVE_STAGE_CANDIDATE");

const { data: stagedRow, error: stageError } = await supabase
  .from("provider_pricing")
  .update({
    cost_per_unit: freshCostPerUnitThb,
    markup_percent: freshMarkupPercent,
    metadata: finalMetadata,
    active: false,
    updated_at: appliedAt,
  })
  .eq("id", before.id)
  .eq("active", false)
  .select("*")
  .single();
if (stageError) throw new Error(`${CONTRACT}_STAGE_FAILED:${stageError.message}`);
requireCertified(stagedRow, "INACTIVE_STAGE_READBACK");
if (
  Math.abs(finite(stagedRow.cost_per_unit, 0) - freshCostPerUnitThb) > 1e-10 ||
  Math.abs(finite(stagedRow.markup_percent, -1) - freshMarkupPercent) > 1e-6
) {
  throw new Error(`${CONTRACT}_FRESH_ECONOMICS_READBACK_MISMATCH`);
}

const { data: activated, error: activateError } = await supabase
  .from("provider_pricing")
  .update({ active: true, updated_at: new Date().toISOString() })
  .eq("id", before.id)
  .eq("active", false)
  .select("*")
  .single();
if (activateError) throw new Error(`${CONTRACT}_ACTIVATION_FAILED:${activateError.message}`);
const finalCertification = requireCertified(activated, "ACTIVE_READBACK");
if (activated.active !== true || activated?.metadata?.production_routing_allowed !== true) {
  throw new Error(`${CONTRACT}_ACTIVE_READBACK_INVALID`);
}

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "APPLY",
  provider: PROVIDER,
  capability: CAPABILITY,
  model: MODEL,
  model_variant: MODEL_VARIANT,
  quality_profile: QUALITY_PROFILE,
  pricing_row_id: activated.id,
  pricing_plan_sha256: planSha,
  fresh_supplier_cost_usd_per_audio_second: freshUsdPerSecond,
  fresh_supplier_cost_thb_per_audio_second: freshCostPerUnitThb,
  customer_price_thb_per_audio_second: existingCustomerPriceThbPerSecond,
  recalculated_markup_percent: freshMarkupPercent,
  customer_price_preserved: true,
  human_quality_reviewer: text(evidence.human_quality_reviewer),
  human_quality_reviewed_at: text(evidence.human_quality_reviewed_at),
  pricing_activation_performed: true,
  database_mutation_performed: true,
  organization_service_mutation_performed: false,
  provider_job_submitted: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
  staged_owned_execution_certification: stagedCertification,
  owned_execution_certification: finalCertification,
}, null, 2));

console.log("AVANTIQO_MUSIC_PRODUCTION_PRICING_APPLY=PASS");
console.log("AVANTIQO_MUSIC_PRODUCTION_PRICING_ACTIVE=true");
console.log("AVANTIQO_MUSIC_FRESH_ECONOMICS_BOUND=true");
console.log("AVANTIQO_MUSIC_CUSTOMER_PRICE_PRESERVED=true");
console.log("AVANTIQO_MUSIC_PROVIDER_JOB_SUBMITTED=false");
console.log("AVANTIQO_MUSIC_ENDPOINT_MUTATION_PERFORMED=false");
console.log("AVANTIQO_MUSIC_PRODUCTION_DEPLOY_PERFORMED=false");
