import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_MUSIC_PRICING_REVIEW_V1";
const PROVIDER = "avantiqo-audio";
const CAPABILITY = "ai.music.generate";
const MODEL = "ACE-Step/Ace-Step1.5";
const VARIANT = "acestep-v15-xl-turbo";
const QUALITY_PROFILE = "ACE_STEP_1_5_XL_TURBO_1_7B_LM_V1";
const LM_MODEL = "acestep-5Hz-lm-1.7B";
const LM_BACKEND = "vllm";
const ECONOMICS_CONTRACT = "AVANTIQO_MUSIC_ECONOMICS_V1";
const HUMAN_CONTRACT = "AVANTIQO_OWNED_MEDIA_CERTIFICATION_EVIDENCE_V1";
const PROMOTION_PLAN_CONTRACT = "AVANTIQO_MUSIC_PROMOTION_PLAN_V1";
const ECONOMICS_INPUT = resolve(
  process.env.AVANTIQO_AUDIO_ECONOMICS_OUTPUT ||
    "/tmp/avantiqo-music-economics.json",
);
const HUMAN_INPUT = resolve(
  process.env.AVANTIQO_MUSIC_CERTIFICATION_EVIDENCE_OUTPUT ||
    "/tmp/avantiqo-music-certification-evidence.json",
);
const PLAN_INPUT = resolve(
  process.env.AVANTIQO_MUSIC_PROMOTION_PLAN_OUTPUT ||
    "/tmp/avantiqo-music-promotion-plan.json",
);
const REVIEW_OUTPUT = resolve(
  process.env.AVANTIQO_MUSIC_PRICING_REVIEW_OUTPUT ||
    "/tmp/avantiqo-music-pricing-review.json",
);

function text(value) {
  return String(value ?? "").trim();
}

function positive(value, code) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(code);
  return number;
}

function round(value, digits = 8) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
}

async function postgrest(path, serviceRoleKey) {
  const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL").replace(/\/+$/, "");
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = null; }
  if (!response.ok) {
    throw new Error(`AVANTIQO_MUSIC_PRICING_REVIEW_DB_HTTP_${response.status}:${text(body?.message || raw).slice(0, 600)}`);
  }
  return body;
}

const [economics, human, plan] = await Promise.all([
  readFile(ECONOMICS_INPUT, "utf8").then(JSON.parse),
  readFile(HUMAN_INPUT, "utf8").then(JSON.parse),
  readFile(PLAN_INPUT, "utf8").then(JSON.parse),
]);

if (text(economics?.contract) !== ECONOMICS_CONTRACT) {
  throw new Error("AVANTIQO_MUSIC_PRICING_REVIEW_ECONOMICS_CONTRACT_INVALID");
}
if (economics?.certification?.economics_measured !== true) {
  throw new Error("AVANTIQO_MUSIC_PRICING_REVIEW_ECONOMICS_REQUIRED");
}
if (text(human?.contract) !== HUMAN_CONTRACT || human?.human_quality_certified !== true) {
  throw new Error("AVANTIQO_MUSIC_PRICING_REVIEW_HUMAN_CERTIFICATION_REQUIRED");
}
if (text(plan?.contract) !== PROMOTION_PLAN_CONTRACT || plan?.ready_for_explicit_pricing_review !== true) {
  throw new Error("AVANTIQO_MUSIC_PRICING_REVIEW_PROMOTION_PLAN_REQUIRED");
}
if (
  text(economics?.provider) !== PROVIDER ||
  text(economics?.foundation_model) !== MODEL ||
  text(economics?.model_variant) !== VARIANT ||
  text(economics?.quality_profile) !== QUALITY_PROFILE ||
  text(economics?.ace_step_lm_model) !== LM_MODEL ||
  text(economics?.ace_step_lm_backend) !== LM_BACKEND
) {
  throw new Error("AVANTIQO_MUSIC_PRICING_REVIEW_RUNTIME_BINDING_INVALID");
}

const serviceRoleKey = required("SUPABASE_SERVICE_ROLE_KEY");
const rows = await postgrest(
  `provider_pricing?provider=eq.${encodeURIComponent(PROVIDER)}&capability=eq.${encodeURIComponent(CAPABILITY)}&select=*`,
  serviceRoleKey,
);
if (!Array.isArray(rows) || rows.length !== 1) {
  throw new Error(`AVANTIQO_MUSIC_PRICING_REVIEW_ROW_RESOLUTION_FAILED:${Array.isArray(rows) ? rows.length : "INVALID"}`);
}
const row = rows[0];
if (row?.active !== false) {
  throw new Error("AVANTIQO_MUSIC_PRICING_REVIEW_EXPECTS_INACTIVE_ROW");
}
if (text(row?.model) !== MODEL || text(row?.unit).toLowerCase() !== "second" || text(row?.currency).toUpperCase() !== "THB") {
  throw new Error("AVANTIQO_MUSIC_PRICING_REVIEW_ROW_CONTRACT_INVALID");
}

const measuredUsdPerSecond = positive(
  economics?.summary?.utilization_adjusted_compute_usd_per_audio_second,
  "AVANTIQO_MUSIC_PRICING_REVIEW_MEASURED_USD_PER_SECOND_REQUIRED",
);
const rowFx = Number(row?.metadata?.fx_to_thb ?? row?.metadata?.fx_thb_per_usd ?? row?.metadata?.usd_thb_reference);
const fxToThb = positive(
  process.env.AVANTIQO_MUSIC_PRICING_FX_TO_THB || rowFx,
  "AVANTIQO_MUSIC_PRICING_REVIEW_FX_REQUIRED",
);
const markupPercent = positive(
  process.env.AVANTIQO_MUSIC_PRICING_MARKUP_PERCENT || 30,
  "AVANTIQO_MUSIC_PRICING_REVIEW_MARKUP_INVALID",
);
const supplierThbPerSecond = measuredUsdPerSecond * fxToThb;
const customerThbPerSecond = supplierThbPerSecond * (1 + markupPercent / 100);
const customerUsdPerSecond = customerThbPerSecond / fxToThb;
const customerUsdPerMinute = customerUsdPerSecond * 60;
const customerUsdPerThreeMinutes = customerUsdPerSecond * 180;
const supplierUsdPerThreeMinutes = measuredUsdPerSecond * 180;
const grossProfitUsdPerThreeMinutes = customerUsdPerThreeMinutes - supplierUsdPerThreeMinutes;
const grossMarginPercent = customerUsdPerThreeMinutes > 0
  ? (grossProfitUsdPerThreeMinutes / customerUsdPerThreeMinutes) * 100
  : 0;

const currentMetadata = row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
  ? row.metadata
  : {};
const staleBindings = {
  model_variant: text(currentMetadata.model_variant) !== VARIANT,
  quality_profile: text(currentMetadata.quality_profile) !== QUALITY_PROFILE,
  ace_step_lm_enabled: currentMetadata.ace_step_lm_enabled !== true,
  ace_step_lm_model: text(currentMetadata.ace_step_lm_model) !== LM_MODEL,
  ace_step_lm_backend: text(currentMetadata.ace_step_lm_backend) !== LM_BACKEND,
  human_quality_certified: currentMetadata.human_quality_certified !== true,
  economics_certified: currentMetadata.economics_certified !== true,
  pricing_status: text(currentMetadata.pricing_status).toUpperCase() !== "PRODUCTION_CERTIFIED",
};

console.log(JSON.stringify({
  contract: CONTRACT,
  mode: "EXPLICIT_REVIEW_NO_MUTATION",
  current_row: {
    id: row.id,
    provider: row.provider,
    capability: row.capability,
    model: row.model,
    unit: row.unit,
    currency: row.currency,
    active: row.active,
    cost_per_unit: Number(row.cost_per_unit),
    markup_percent: Number(row.markup_percent),
    pricing_status: currentMetadata.pricing_status || null,
    model_variant: currentMetadata.model_variant || null,
    ace_step_lm_enabled: currentMetadata.ace_step_lm_enabled === true,
  },
  stale_bindings: staleBindings,
  measured: {
    gpu_type_ids: economics?.summary?.gpu_type_ids || [],
    compute_usd_per_audio_second: measuredUsdPerSecond,
    compute_usd_per_audio_minute: Number(economics?.summary?.utilization_adjusted_compute_usd_per_audio_minute),
  },
  proposed_production_pricing: {
    fx_to_thb: fxToThb,
    supplier_cost_thb_per_second: round(supplierThbPerSecond, 10),
    markup_percent: markupPercent,
    customer_price_thb_per_second: round(customerThbPerSecond, 10),
    customer_price_usd_per_minute: round(customerUsdPerMinute, 6),
    customer_price_usd_per_three_minutes: round(customerUsdPerThreeMinutes, 6),
    supplier_cost_usd_per_three_minutes: round(supplierUsdPerThreeMinutes, 6),
    gross_profit_usd_per_three_minutes: round(grossProfitUsdPerThreeMinutes, 6),
    gross_margin_percent: round(grossMarginPercent, 3),
  },
  human_quality_reviewer: human?.capabilities?.[0]?.reviewer || null,
  mutation_performed: false,
  pricing_activation_performed: false,
  production_deploy_performed: false,
  activation_allowed: false,
}, null, 2));

const rl = createInterface({ input, output });
try {
  const reviewer = text(process.env.AVANTIQO_MUSIC_PRICING_REVIEWER) || text(await rl.question("Pricing reviewer name: "));
  if (!reviewer) throw new Error("AVANTIQO_MUSIC_PRICING_REVIEW_REVIEWER_REQUIRED");
  const approval = text(await rl.question(
    `Approve ${markupPercent}% markup and approximately $${customerUsdPerThreeMinutes.toFixed(2)} per 3 generated audio minutes? Type YES: `,
  )).toUpperCase();
  if (approval !== "YES") {
    throw new Error("AVANTIQO_MUSIC_PRICING_REVIEW_EXPLICIT_APPROVAL_REQUIRED");
  }

  const evidence = {
    contract: CONTRACT,
    generated_at: new Date().toISOString(),
    review_status: "APPROVED",
    reviewer,
    reviewed_at: new Date().toISOString(),
    provider: PROVIDER,
    capability: CAPABILITY,
    model: MODEL,
    model_variant: VARIANT,
    quality_profile: QUALITY_PROFILE,
    ace_step_lm_required: true,
    ace_step_lm_model: LM_MODEL,
    ace_step_lm_backend: LM_BACKEND,
    thinking_required: true,
    source_economics_contract: ECONOMICS_CONTRACT,
    source_benchmark_id: economics?.source_benchmark_id || null,
    source_human_evidence_contract: HUMAN_CONTRACT,
    source_promotion_plan_contract: PROMOTION_PLAN_CONTRACT,
    provider_pricing_row_id: row.id,
    current_row_active: false,
    stale_bindings: staleBindings,
    pricing: {
      currency: "THB",
      unit: "second",
      fx_to_thb: fxToThb,
      measured_supplier_cost_usd_per_second: round(measuredUsdPerSecond, 10),
      measured_supplier_cost_usd_per_audio_minute: round(measuredUsdPerSecond * 60, 8),
      supplier_cost_thb_per_second: round(supplierThbPerSecond, 10),
      markup_percent: markupPercent,
      customer_price_thb_per_second: round(customerThbPerSecond, 10),
      customer_price_usd_per_minute: round(customerUsdPerMinute, 8),
      customer_price_usd_per_three_minutes: round(customerUsdPerThreeMinutes, 8),
      supplier_cost_usd_per_three_minutes: round(supplierUsdPerThreeMinutes, 8),
      gross_profit_usd_per_three_minutes: round(grossProfitUsdPerThreeMinutes, 8),
      gross_margin_percent: round(grossMarginPercent, 4),
    },
    ready_for_explicit_promotion: true,
    database_mutation_performed: false,
    provider_configuration_mutation_performed: false,
    pricing_activation_performed: false,
    production_deploy_performed: false,
    automatic_activation_forbidden: true,
    activation_allowed: false,
    secrets_printed: false,
  };
  await writeFile(REVIEW_OUTPUT, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({
    success: true,
    output_path: REVIEW_OUTPUT,
    contract: CONTRACT,
    review_status: "APPROVED",
    reviewer,
    markup_percent: markupPercent,
    customer_price_usd_per_three_minutes: evidence.pricing.customer_price_usd_per_three_minutes,
    gross_margin_percent: evidence.pricing.gross_margin_percent,
    ready_for_explicit_promotion: true,
    database_mutation_performed: false,
    pricing_activation_performed: false,
    production_deploy_performed: false,
    activation_allowed: false,
  }, null, 2));
} finally {
  rl.close();
}
