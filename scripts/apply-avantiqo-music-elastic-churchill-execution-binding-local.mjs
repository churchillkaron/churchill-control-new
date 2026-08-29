#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";
import { getPlatformAIService } from "../lib/platform/service-runtime/ai/PlatformAIServiceCatalog.js";
import { ownedProviderForCapability } from "../lib/platform/service-runtime/providers/AvantiqoOwnedProviderPolicy.js";
import { ownedExecutionCertification } from "../lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_MUSIC_ELASTIC_CHURCHILL_EXECUTION_BINDING_APPLY_V1";
const PLAN_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_CHURCHILL_EXECUTION_BINDING_PLAN_V2";
const CAPABILITY = "ai.audio.elastic-warp";
const PROVIDER = "avantiqo-audio";
const MODEL = "signalsmith-stretch";
const CURRENCY = "THB";
const CHURCHILL_ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const CHURCHILL_ENTITY_ID = "073dc5f5-b6a8-4cae-8cda-fd7acb21ef50";
const PRODUCTION_PROJECT_REF = "vfsjqabpkcbiuerhzugk";
const EXPECTED_ENDPOINT_ID = "9hl8bjuce4n4bm";
const EXPECTED_VERCEL_PROJECT_ID = "prj_5K2x3kGkhs3d2PU8VOQQPyNT24A9";
const EXPECTED_VERCEL_ORG_ID = "team_40jy42BqQOs4U6pVdkawwEfp";
const PRICING_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_PRODUCTION_PRICING_V1";
const REVIEWER_REPAIR_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_HUMAN_QUALITY_REVIEWER_REPAIR_V3";
const PLATFORM_ENTITLEMENT = "PLATFORM_STANDARD";
const APPROVAL_ENV = "AVANTIQO_MUSIC_ELASTIC_CHURCHILL_EXECUTION_BINDING_APPLY_APPROVED";
const PLAN_ENV = "AVANTIQO_MUSIC_ELASTIC_CHURCHILL_EXECUTION_BINDING_PLAN_V2_OUTPUT";
const ENDPOINT_ENV = "RUNPOD_AVANTIQO_MUSIC_ELASTIC_ENDPOINT_ID";
const ENABLED_ENV = "AVANTIQO_MUSIC_ELASTIC_ENGINE_ENABLED";
const CERTIFIED_ENV = "AVANTIQO_MUSIC_ELASTIC_ENGINE_CERTIFIED";
const RUNPOD_KEY_ENV = "RUNPOD_API_KEY";

const text = (value) => String(value ?? "").trim();
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const hashText = (value) => sha256(Buffer.from(text(value), "utf8"));

function arg(prefix) {
  return text(process.argv.slice(2).find((entry) => entry.startsWith(prefix))?.slice(prefix.length));
}

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

function check(name, condition) {
  if (!condition) throw new Error(`${CONTRACT}_${name}`);
}

function reviewerIdentityValid(value) {
  const reviewer = text(value).replace(/\s+/g, " ");
  const lower = reviewer.toLowerCase();
  if (reviewer.length < 2 || reviewer.length > 120) return false;
  if (!/[\p{L}]/u.test(reviewer)) return false;
  const forbiddenExact = new Set([
    "your actual reviewer name", "actual reviewer name", "your reviewer name",
    "real reviewer name here", "real reviewer name", "reviewer name here",
    "reviewer name", "reviewer", "placeholder", "unknown", "tbd", "todo",
    "n/a", "na", "none", "test", "example", "human", "operator", "person",
  ]);
  if (forbiddenExact.has(lower)) return false;
  const forbiddenFragments = [
    "your actual reviewer", "actual reviewer name", "real reviewer name",
    "reviewer name here", "replace with", "placeholder", "enter name", "full name here",
  ];
  if (forbiddenFragments.some((fragment) => lower.includes(fragment))) return false;
  const genericTokens = new Set(["real", "actual", "reviewer", "name", "here", "person", "human", "operator"]);
  const tokens = reviewer.split(/\s+/)
    .map((word) => word.toLowerCase().replace(/[^\p{L}]/gu, ""))
    .filter(Boolean);
  if (tokens.length && tokens.every((token) => genericTokens.has(token))) return false;
  return true;
}

function runVercel(args) {
  const result = spawnSync("vercel", args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      VERCEL_PROJECT_ID: EXPECTED_VERCEL_PROJECT_ID,
      VERCEL_ORG_ID: EXPECTED_VERCEL_ORG_ID,
    },
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error?.code === "ENOENT") throw new Error(`${CONTRACT}_VERCEL_CLI_REQUIRED`);
  if (result.status !== 0) {
    const detail = text([result.stdout, result.stderr].filter(Boolean).join("\n")).slice(-2000);
    throw new Error(`${CONTRACT}_VERCEL_COMMAND_FAILED:${detail}`);
  }
  return `${result.stdout || ""}\n${result.stderr || ""}`;
}

function readProductionRuntimeState() {
  const expectedEndpointHash = hashText(EXPECTED_ENDPOINT_ID);
  const probe = `
const crypto = require("node:crypto");
const text = (v) => String(v ?? "").trim();
const on = (v) => ["1","true","yes","on"].includes(text(v).toLowerCase());
const endpoint = text(process.env.${ENDPOINT_ENV});
const endpointHash = endpoint ? crypto.createHash("sha256").update(endpoint).digest("hex") : null;
const value = {
  endpoint_present: Boolean(endpoint),
  endpoint_sha256: endpointHash,
  endpoint_matches_expected: endpointHash === ${JSON.stringify(expectedEndpointHash)},
  engine_enabled_true: on(process.env.${ENABLED_ENV}),
  engine_certified_true: on(process.env.${CERTIFIED_ENV}),
  runpod_api_key_present: Boolean(text(process.env.${RUNPOD_KEY_ENV})),
};
console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_RUNTIME_STATE=" + JSON.stringify(value));
`;
  const combined = runVercel(["env", "run", "-e", "production", "--", "node", "-e", probe]);
  const match = combined.match(/AVANTIQO_MUSIC_ELASTIC_PRODUCTION_RUNTIME_STATE=(\{[^\n]+\})/);
  if (!match) throw new Error(`${CONTRACT}_PRODUCTION_RUNTIME_STATE_PROBE_MISSING`);
  return JSON.parse(match[1]);
}

function assertProductionRuntime(runtime, plan) {
  check("PRODUCTION_ENGINE_ENABLED_REQUIRED", runtime.engine_enabled_true === true);
  check("PRODUCTION_ENGINE_CERTIFIED_REQUIRED", runtime.engine_certified_true === true);
  check("PRODUCTION_ENDPOINT_REQUIRED", runtime.endpoint_present === true);
  check("PRODUCTION_ENDPOINT_MISMATCH", runtime.endpoint_matches_expected === true);
  check("PRODUCTION_RUNPOD_API_KEY_REQUIRED", runtime.runpod_api_key_present === true);
  check(
    "PRODUCTION_ENDPOINT_CHANGED_SINCE_PLAN",
    text(runtime.endpoint_sha256) === text(plan?.production_runtime_configuration?.endpoint_sha256),
  );
}

function finalBindingMatches(row, planSha) {
  const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const configuration = row?.configuration && typeof row.configuration === "object" ? row.configuration : {};
  return Boolean(
    text(row?.organization_id) === CHURCHILL_ORGANIZATION_ID &&
    text(row?.entity_id) === CHURCHILL_ENTITY_ID &&
    text(row?.service_category_id) === "ai" &&
    text(row?.service_id) === CAPABILITY &&
    text(row?.package_id) === "creative" &&
    text(row?.status).toUpperCase() === "ACTIVE" &&
    row?.authorization_required === true &&
    row?.usage_enabled === true &&
    row?.billing_enabled === true &&
    text(row?.managed_by).toLowerCase() === "avantiqo" &&
    text(row?.default_provider_id) === PROVIDER &&
    row?.fallback_enabled === false &&
    text(row?.billing_mode).toUpperCase() === "USAGE" &&
    text(row?.pricing_mode).toUpperCase() === "PROVIDER" &&
    text(row?.default_currency).toUpperCase() === CURRENCY &&
    text(row?.default_model) === MODEL &&
    metadata.execution_binding_only === true &&
    metadata.customer_entitlement_gate === false &&
    text(metadata.entitlement_source) === PLATFORM_ENTITLEMENT &&
    text(metadata.capability) === CAPABILITY &&
    text(metadata.provider) === PROVIDER &&
    text(metadata.model) === MODEL &&
    text(metadata.apply_contract) === CONTRACT &&
    text(metadata.apply_plan_sha256) === planSha &&
    metadata.activation_pending === false &&
    text(configuration.entitlement_source) === PLATFORM_ENTITLEMENT &&
    text(configuration.owned_provider_required) === PROVIDER &&
    configuration.external_fallback_allowed === false
  );
}

approved(APPROVAL_ENV);
const planPath = arg("--plan=") || text(process.env[PLAN_ENV]);
if (!planPath) throw new Error(`${CONTRACT}_PLAN_PATH_REQUIRED`);
if (!fs.existsSync(planPath)) throw new Error(`${CONTRACT}_PLAN_FILE_NOT_FOUND`);
const planBytes = fs.readFileSync(planPath);
const planSha = sha256(planBytes);
const plan = JSON.parse(planBytes.toString("utf8"));

check("PLAN_SUCCESS_REQUIRED", plan?.success === true);
check("PLAN_CONTRACT_MISMATCH", text(plan?.contract) === PLAN_CONTRACT);
check("PLAN_MODE_MISMATCH", text(plan?.mode) === "PLAN");
check("PLAN_READY_REQUIRED", plan?.plan_ready === true);
check("PLAN_BLOCKERS_MUST_BE_EMPTY", Array.isArray(plan?.blockers) && plan.blockers.length === 0);
check("PLAN_PROJECT_REF_MISMATCH", text(plan?.production_project_ref) === PRODUCTION_PROJECT_REF);
check("PLAN_VERCEL_PROJECT_MISMATCH", text(plan?.vercel?.project_id) === EXPECTED_VERCEL_PROJECT_ID);
check("PLAN_VERCEL_ORGANIZATION_MISMATCH", text(plan?.vercel?.organization_id) === EXPECTED_VERCEL_ORG_ID);
check("PLAN_VERCEL_ENVIRONMENT_MISMATCH", text(plan?.vercel?.environment) === "production");
check("PLAN_ORGANIZATION_MISMATCH", text(plan?.organization?.id) === CHURCHILL_ORGANIZATION_ID);
check("PLAN_ENTITY_MISMATCH", text(plan?.organization?.entity_id) === CHURCHILL_ENTITY_ID);
check("PLAN_CAPABILITY_MISMATCH", text(plan?.capability) === CAPABILITY);
check("PLAN_ENTITLEMENT_MISMATCH", text(plan?.platform_entitlement?.source) === PLATFORM_ENTITLEMENT);
check("PLAN_ROW_MUST_NOT_BE_ENTITLEMENT_GATE", plan?.platform_entitlement?.organization_row_is_entitlement_gate === false);
check("PLAN_EXECUTION_BINDING_REQUIRED", plan?.execution_binding?.required_by_current_service_runtime === true);
check("PLAN_OPERATION_MUST_BE_INSERT", text(plan?.execution_binding?.proposed_operation) === "INSERT");
check("PLAN_CHURCHILL_EXISTING_ROW_COUNT_MUST_BE_ZERO", Number(plan?.execution_binding?.existing_churchill_row_count) === 0);
check("PLAN_GLOBAL_EXISTING_ROW_COUNT_MUST_BE_ZERO", Number(plan?.execution_binding?.existing_global_row_count) === 0);
check("PLAN_DATABASE_MUTATION_MUST_BE_FALSE", plan?.database_mutation_performed === false);
check("PLAN_ORGANIZATION_SERVICE_MUTATION_MUST_BE_FALSE", plan?.organization_service_mutation_performed === false);
check("PLAN_PRICING_MUTATION_MUST_BE_FALSE", plan?.pricing_mutation_performed === false);
check("PLAN_WALLET_MUTATION_MUST_BE_FALSE", plan?.wallet_mutation_performed === false);
check("PLAN_PROVIDER_JOB_MUST_BE_FALSE", plan?.provider_job_submitted === false);
check("PLAN_ENDPOINT_MUTATION_MUST_BE_FALSE", plan?.endpoint_mutation_performed === false);
check("PLAN_PRODUCTION_DEPLOY_MUST_BE_FALSE", plan?.production_deploy_performed === false);

const proposed = plan?.execution_binding?.proposed_row || {};
check("PROPOSED_ORGANIZATION_MISMATCH", text(proposed.organization_id) === CHURCHILL_ORGANIZATION_ID);
check("PROPOSED_ENTITY_MISMATCH", text(proposed.entity_id) === CHURCHILL_ENTITY_ID);
check("PROPOSED_PARTY_MUST_BE_NULL", proposed.party_id == null);
check("PROPOSED_SERVICE_CATEGORY_MISMATCH", text(proposed.service_category_id) === "ai");
check("PROPOSED_SERVICE_ID_MISMATCH", text(proposed.service_id) === CAPABILITY);
check("PROPOSED_PACKAGE_MISMATCH", text(proposed.package_id) === "creative");
check("PROPOSED_STATUS_MISMATCH", text(proposed.status).toUpperCase() === "ACTIVE");
check("PROPOSED_MANAGED_BY_MISMATCH", text(proposed.managed_by).toLowerCase() === "avantiqo");
check("PROPOSED_AUTHORIZATION_REQUIRED", proposed.authorization_required === true);
check("PROPOSED_USAGE_ENABLED_REQUIRED", proposed.usage_enabled === true);
check("PROPOSED_BILLING_ENABLED_REQUIRED", proposed.billing_enabled === true);
check("PROPOSED_PROVIDER_MISMATCH", text(proposed.default_provider_id) === PROVIDER);
check("PROPOSED_FALLBACK_MUST_BE_FALSE", proposed.fallback_enabled === false);
check("PROPOSED_BILLING_MODE_MISMATCH", text(proposed.billing_mode).toUpperCase() === "USAGE");
check("PROPOSED_PRICING_MODE_MISMATCH", text(proposed.pricing_mode).toUpperCase() === "PROVIDER");
check("PROPOSED_CURRENCY_MISMATCH", text(proposed.default_currency).toUpperCase() === CURRENCY);
check("PROPOSED_MODEL_MISMATCH", text(proposed.default_model) === MODEL);
check("PROPOSED_EXECUTION_BINDING_ONLY_REQUIRED", proposed?.metadata?.execution_binding_only === true);
check("PROPOSED_CUSTOMER_ENTITLEMENT_GATE_MUST_BE_FALSE", proposed?.metadata?.customer_entitlement_gate === false);
check("PROPOSED_ENTITLEMENT_SOURCE_MISMATCH", text(proposed?.metadata?.entitlement_source) === PLATFORM_ENTITLEMENT);
check("PROPOSED_PRICING_CONTRACT_MISMATCH", text(proposed?.metadata?.pricing_contract) === PRICING_CONTRACT);
check("PROPOSED_PRICING_STATUS_MISMATCH", text(proposed?.metadata?.pricing_status) === "PRODUCTION_CERTIFIED");
check("PROPOSED_REVIEWER_INVALID", reviewerIdentityValid(proposed?.metadata?.human_quality_reviewer));
check("PROPOSED_AUTOMATIC_APPLY_MUST_BE_FORBIDDEN", proposed?.metadata?.automatic_apply_forbidden === true);
check("PROPOSED_MUSICIAN_PLAN_REQUIRED", proposed?.metadata?.musician_approved_warp_plan_required === true);
check("PROPOSED_ROW_NOT_LIVE_UNTIL_DEPLOY_REQUIRED", proposed?.metadata?.production_deploy_required_before_live_runtime === true);

const platformService = getPlatformAIService(CAPABILITY);
check("PLATFORM_AI_CATALOG_ENTRY_REQUIRED", text(platformService?.id) === CAPABILITY);
check("OWNED_PROVIDER_POLICY_MISMATCH", ownedProviderForCapability(CAPABILITY) === PROVIDER);

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
let projectRef = "";
try {
  projectRef = new URL(supabaseUrl).hostname.split(".")[0];
} catch {
  throw new Error(`${CONTRACT}_SUPABASE_URL_INVALID`);
}
check("PRODUCTION_PROJECT_REF_MISMATCH", projectRef === PRODUCTION_PROJECT_REF);

runVercel(["--version"]);
const runtimeBefore = readProductionRuntimeState();
assertProductionRuntime(runtimeBefore, plan);

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function currentBindings() {
  const [churchillResult, globalResult] = await Promise.all([
    supabase.from("organization_services").select("*")
      .eq("organization_id", CHURCHILL_ORGANIZATION_ID).eq("service_id", CAPABILITY),
    supabase.from("organization_services").select("id,organization_id,service_id,status,usage_enabled,billing_enabled,metadata")
      .eq("service_id", CAPABILITY),
  ]);
  if (churchillResult.error) throw new Error(`${CONTRACT}_CHURCHILL_BINDING_READ_FAILED:${churchillResult.error.message}`);
  if (globalResult.error) throw new Error(`${CONTRACT}_GLOBAL_BINDING_READ_FAILED:${globalResult.error.message}`);
  return { churchill: churchillResult.data || [], global: globalResult.data || [] };
}

async function currentPricing() {
  const { data, error } = await supabase.from("provider_pricing").select("*")
    .eq("id", text(plan?.pricing?.id))
    .eq("provider", PROVIDER)
    .eq("capability", CAPABILITY)
    .eq("model", MODEL)
    .eq("currency", CURRENCY)
    .single();
  if (error) throw new Error(`${CONTRACT}_PRICING_READ_FAILED:${error.message}`);
  return data;
}

async function currentWallet() {
  const { data, error } = await supabase.from("organization_wallets")
    .select("id,organization_id,entity_id,currency,default_currency,available_balance,reserved_balance,billing_policy,wallet_type,status,allow_negative,minimum_balance")
    .eq("id", text(plan?.wallet?.id))
    .eq("organization_id", CHURCHILL_ORGANIZATION_ID)
    .eq("currency", CURRENCY)
    .single();
  if (error) throw new Error(`${CONTRACT}_WALLET_READ_FAILED:${error.message}`);
  return data;
}

async function currentReferenceService() {
  const { data, error } = await supabase.from("organization_services").select("*")
    .eq("organization_id", CHURCHILL_ORGANIZATION_ID)
    .eq("service_id", "ai.music.generate")
    .single();
  if (error) throw new Error(`${CONTRACT}_REFERENCE_MUSIC_SERVICE_READ_FAILED:${error.message}`);
  return data;
}

function validatePricing(pricing) {
  const metadata = pricing?.metadata && typeof pricing.metadata === "object" ? pricing.metadata : {};
  check("PRICING_ACTIVE_REQUIRED", pricing?.active === true);
  check("PRICING_ID_CHANGED_SINCE_PLAN", text(pricing?.id) === text(plan?.pricing?.id));
  check("PRICING_CONTRACT_MISMATCH", text(metadata.pricing_contract) === PRICING_CONTRACT);
  check("PRICING_STATUS_MISMATCH", text(metadata.pricing_status) === "PRODUCTION_CERTIFIED");
  check("PRICING_ROUTING_ALLOWED_REQUIRED", metadata.production_routing_allowed === true);
  check("PRICING_CERTIFIED_CAPABILITY_MISMATCH", text(metadata.certified_capability) === CAPABILITY);
  check("PRICING_CERTIFIED_MODEL_MISMATCH", text(metadata.certified_model) === MODEL);
  check("PRICING_REVIEWER_CHANGED_SINCE_PLAN", text(metadata.human_quality_reviewer) === text(plan?.pricing?.reviewer));
  check("PRICING_REVIEWER_INVALID", reviewerIdentityValid(metadata.human_quality_reviewer));
  check("PRICING_REVIEWER_SOURCE_REQUIRED", text(metadata.human_quality_reviewer_identity_source) === "EXPLICIT_OPERATOR_INPUT");
  check("PRICING_REVIEWER_REPAIR_CONTRACT_MISMATCH", text(metadata.human_quality_reviewer_repair_contract) === REVIEWER_REPAIR_CONTRACT);
  const certification = ownedExecutionCertification({
    provider: { id: PROVIDER, metadata: { configured_foundation_model: MODEL, foundation_models: [MODEL] } },
    capability: CAPABILITY,
    pricing,
  });
  check("OWNED_EXECUTION_CERTIFICATION_REQUIRED", certification?.eligible === true);
  return certification;
}

function validateWallet(wallet) {
  check("WALLET_ID_CHANGED_SINCE_PLAN", text(wallet?.id) === text(plan?.wallet?.id));
  check("WALLET_ENTITY_MISMATCH", text(wallet?.entity_id) === CHURCHILL_ENTITY_ID);
  check("WALLET_STATUS_ACTIVE_REQUIRED", text(wallet?.status).toUpperCase() === "ACTIVE");
  check("WALLET_PREPAID_POLICY_REQUIRED", text(wallet?.billing_policy).toUpperCase() === "PREPAID");
  check("WALLET_PREPAID_TYPE_REQUIRED", text(wallet?.wallet_type).toUpperCase() === "PREPAID");
  check("WALLET_CURRENCY_MISMATCH", text(wallet?.currency).toUpperCase() === CURRENCY);
  check("WALLET_DEFAULT_CURRENCY_MISMATCH", text(wallet?.default_currency).toUpperCase() === CURRENCY);
  check("WALLET_NEGATIVE_MUST_BE_FORBIDDEN", wallet?.allow_negative === false);
  const available = finite(wallet?.available_balance, 0);
  const minimum = finite(wallet?.minimum_balance, 0);
  const oneSecondCustomerPrice = finite(plan?.pricing?.customer_price_per_second, 0);
  check("ONE_SECOND_CUSTOMER_PRICE_REQUIRED", oneSecondCustomerPrice > 0);
  check("WALLET_RESERVATION_HEADROOM_REQUIRED", available - minimum >= oneSecondCustomerPrice);
}

function validateReferenceService(reference) {
  check("REFERENCE_SERVICE_ACTIVE_REQUIRED", text(reference?.status).toUpperCase() === "ACTIVE");
  check("REFERENCE_SERVICE_ENTITY_MISMATCH", text(reference?.entity_id) === CHURCHILL_ENTITY_ID);
  check("REFERENCE_SERVICE_MANAGED_BY_MISMATCH", text(reference?.managed_by).toLowerCase() === "avantiqo");
}

const bindingBefore = await currentBindings();
const pricingBefore = await currentPricing();
const walletBefore = await currentWallet();
const referenceBefore = await currentReferenceService();
const certificationBefore = validatePricing(pricingBefore);
validateWallet(walletBefore);
validateReferenceService(referenceBefore);

if (bindingBefore.churchill.length === 1) {
  const existing = bindingBefore.churchill[0];
  if (!finalBindingMatches(existing, planSha)) {
    throw new Error(`${CONTRACT}_EXISTING_CHURCHILL_BINDING_NOT_OWNED_BY_THIS_PLAN`);
  }
  console.log(JSON.stringify({
    success: true,
    contract: CONTRACT,
    mode: "APPLY",
    idempotent: true,
    plan_path: planPath,
    plan_sha256: planSha,
    binding_row_id: existing.id,
    organization_id: CHURCHILL_ORGANIZATION_ID,
    capability: CAPABILITY,
    platform_entitlement: PLATFORM_ENTITLEMENT,
    execution_binding_only: true,
    customer_entitlement_gate: false,
    active: true,
    owned_execution_certification: certificationBefore,
    production_runtime_configuration_verified: true,
    production_deploy_required_before_live_runtime: true,
    current_production_deployment_rebuilt: false,
    database_mutation_performed: false,
    organization_service_mutation_performed: false,
    pricing_mutation_performed: false,
    wallet_mutation_performed: false,
    provider_job_submitted: false,
    endpoint_mutation_performed: false,
    production_deploy_performed: false,
    next_action: "RUN_CHURCHILL_ELASTIC_GENERATION_FREE_RUNTIME_READINESS_AUDIT",
  }, null, 2));
  console.log("AVANTIQO_MUSIC_ELASTIC_CHURCHILL_EXECUTION_BINDING_APPLY=PASS");
  console.log("AVANTIQO_MUSIC_ELASTIC_CHURCHILL_EXECUTION_BINDING_ACTIVE=true");
  console.log("AVANTIQO_MUSIC_ELASTIC_CHURCHILL_EXECUTION_BINDING_IDEMPOTENT=true");
  console.log("AVANTIQO_MUSIC_ELASTIC_DATABASE_MUTATION_PERFORMED=false");
  console.log("AVANTIQO_MUSIC_ELASTIC_ORGANIZATION_SERVICE_MUTATION_PERFORMED=false");
  console.log("AVANTIQO_MUSIC_ELASTIC_PRICING_MUTATION_PERFORMED=false");
  console.log("AVANTIQO_MUSIC_ELASTIC_WALLET_MUTATION_PERFORMED=false");
  console.log("AVANTIQO_MUSIC_ELASTIC_PROVIDER_JOB_SUBMITTED=false");
  console.log("AVANTIQO_MUSIC_ELASTIC_ENDPOINT_MUTATION_PERFORMED=false");
  console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_DEPLOY_PERFORMED=false");
  console.log("AVANTIQO_MUSIC_ELASTIC_NEXT=RUN_CHURCHILL_ELASTIC_GENERATION_FREE_RUNTIME_READINESS_AUDIT");
  process.exit(0);
}

check("CHURCHILL_BINDING_COUNT_CHANGED_SINCE_PLAN", bindingBefore.churchill.length === 0);
check("GLOBAL_BINDING_COUNT_CHANGED_SINCE_PLAN", bindingBefore.global.length === 0);

const stagedAt = new Date().toISOString();
const baseConfiguration = proposed.configuration && typeof proposed.configuration === "object" ? proposed.configuration : {};
const baseMetadata = proposed.metadata && typeof proposed.metadata === "object" ? proposed.metadata : {};
const commonAuditMetadata = {
  ...baseMetadata,
  apply_contract: CONTRACT,
  apply_plan_contract: PLAN_CONTRACT,
  apply_plan_sha256: planSha,
  production_runtime_configuration_verified_at_apply: true,
  production_deploy_required_before_live_runtime: true,
  current_production_deployment_rebuilt: false,
};
const commonConfiguration = {
  ...baseConfiguration,
  apply_contract: CONTRACT,
  apply_plan_sha256: planSha,
};

const stagedPayload = {
  organization_id: CHURCHILL_ORGANIZATION_ID,
  entity_id: CHURCHILL_ENTITY_ID,
  party_id: null,
  service_category_id: "ai",
  service_id: CAPABILITY,
  solution_id: null,
  package_id: "creative",
  status: "INACTIVE",
  managed_by: "avantiqo",
  authorization_required: true,
  usage_enabled: false,
  billing_enabled: false,
  health: "UNKNOWN",
  activated_at: null,
  suspended_at: null,
  default_provider_id: PROVIDER,
  fallback_enabled: false,
  billing_mode: "USAGE",
  pricing_mode: "PROVIDER",
  budget_limit: 0,
  budget_used: 0,
  hard_budget_limit: false,
  default_currency: CURRENCY,
  default_model: MODEL,
  configuration: commonConfiguration,
  metadata: {
    ...commonAuditMetadata,
    execution_binding_stage: "INACTIVE_PRE_ACTIVATION_VERIFIED",
    activation_pending: true,
    staged_at: stagedAt,
  },
  updated_at: stagedAt,
};

const { data: staged, error: stageError } = await supabase
  .from("organization_services")
  .insert(stagedPayload)
  .select("*")
  .single();
if (stageError) throw new Error(`${CONTRACT}_STAGED_INSERT_FAILED:${stageError.message}`);
check("STAGED_ROW_ID_REQUIRED", Boolean(text(staged?.id)));
check("STAGED_STATUS_MUST_BE_INACTIVE", text(staged?.status).toUpperCase() === "INACTIVE");
check("STAGED_USAGE_MUST_BE_DISABLED", staged?.usage_enabled === false);
check("STAGED_BILLING_MUST_BE_DISABLED", staged?.billing_enabled === false);
check("STAGED_PLAN_SHA_MISMATCH", text(staged?.metadata?.apply_plan_sha256) === planSha);
check("STAGED_MUST_NOT_BE_ENTITLEMENT_GATE", staged?.metadata?.customer_entitlement_gate === false);

const runtimeMid = readProductionRuntimeState();
assertProductionRuntime(runtimeMid, plan);
const bindingMid = await currentBindings();
check("STAGED_CHURCHILL_BINDING_COUNT_INVALID", bindingMid.churchill.length === 1);
check("STAGED_GLOBAL_BINDING_COUNT_INVALID", bindingMid.global.length === 1);
check("STAGED_ROW_CHANGED", text(bindingMid.churchill[0]?.id) === text(staged.id));
check("STAGED_ROW_BECAME_ACTIVE_UNEXPECTEDLY", text(bindingMid.churchill[0]?.status).toUpperCase() === "INACTIVE");
check("STAGED_USAGE_ENABLED_UNEXPECTEDLY", bindingMid.churchill[0]?.usage_enabled === false);
check("STAGED_BILLING_ENABLED_UNEXPECTEDLY", bindingMid.churchill[0]?.billing_enabled === false);
const pricingMid = await currentPricing();
const walletMid = await currentWallet();
validatePricing(pricingMid);
validateWallet(walletMid);

const activatedAt = new Date().toISOString();
const finalMetadata = {
  ...commonAuditMetadata,
  execution_binding_stage: "ACTIVE_VERIFIED",
  activation_pending: false,
  staged_at: stagedAt,
  activated_at: activatedAt,
};
const { data: activated, error: activationError } = await supabase
  .from("organization_services")
  .update({
    status: "ACTIVE",
    usage_enabled: true,
    billing_enabled: true,
    health: "UNKNOWN",
    activated_at: activatedAt,
    suspended_at: null,
    configuration: commonConfiguration,
    metadata: finalMetadata,
    updated_at: activatedAt,
  })
  .eq("id", staged.id)
  .eq("organization_id", CHURCHILL_ORGANIZATION_ID)
  .eq("service_id", CAPABILITY)
  .eq("status", "INACTIVE")
  .eq("usage_enabled", false)
  .eq("billing_enabled", false)
  .select("*")
  .single();
if (activationError) throw new Error(`${CONTRACT}_ACTIVATION_FAILED:${activationError.message}`);
check("ACTIVE_READBACK_INVALID", finalBindingMatches(activated, planSha));

const bindingAfter = await currentBindings();
check("FINAL_CHURCHILL_BINDING_COUNT_INVALID", bindingAfter.churchill.length === 1);
check("FINAL_GLOBAL_BINDING_COUNT_INVALID", bindingAfter.global.length === 1);
check("FINAL_ROW_ID_CHANGED", text(bindingAfter.churchill[0]?.id) === text(staged.id));
check("FINAL_ROW_READBACK_INVALID", finalBindingMatches(bindingAfter.churchill[0], planSha));
const runtimeAfter = readProductionRuntimeState();
assertProductionRuntime(runtimeAfter, plan);
const pricingAfter = await currentPricing();
const walletAfter = await currentWallet();
const certificationAfter = validatePricing(pricingAfter);
validateWallet(walletAfter);

console.log(JSON.stringify({
  success: true,
  contract: CONTRACT,
  mode: "APPLY",
  idempotent: false,
  plan_path: planPath,
  plan_sha256: planSha,
  binding_row_id: activated.id,
  organization_id: CHURCHILL_ORGANIZATION_ID,
  entity_id: CHURCHILL_ENTITY_ID,
  capability: CAPABILITY,
  platform_entitlement: PLATFORM_ENTITLEMENT,
  execution_binding_only: true,
  customer_entitlement_gate: false,
  staged_inactive_before_activation: true,
  staged_at: stagedAt,
  activated_at: activatedAt,
  active: true,
  usage_enabled: true,
  billing_enabled: true,
  provider: PROVIDER,
  model: MODEL,
  currency: CURRENCY,
  pricing_id: pricingAfter.id,
  owned_execution_certification: certificationAfter,
  production_runtime_configuration_verified: true,
  production_endpoint_sha256: runtimeAfter.endpoint_sha256,
  production_endpoint_matches_certified: runtimeAfter.endpoint_matches_expected,
  production_deploy_required_before_live_runtime: true,
  current_production_deployment_rebuilt: false,
  exact_churchill_binding_count_after: bindingAfter.churchill.length,
  exact_global_binding_count_after: bindingAfter.global.length,
  database_mutation_performed: true,
  organization_service_mutation_performed: true,
  pricing_mutation_performed: false,
  wallet_mutation_performed: false,
  provider_job_submitted: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
  next_action: "RUN_CHURCHILL_ELASTIC_GENERATION_FREE_RUNTIME_READINESS_AUDIT",
}, null, 2));
console.log("AVANTIQO_MUSIC_ELASTIC_CHURCHILL_EXECUTION_BINDING_APPLY=PASS");
console.log("AVANTIQO_MUSIC_ELASTIC_CHURCHILL_EXECUTION_BINDING_ACTIVE=true");
console.log("AVANTIQO_MUSIC_ELASTIC_CHURCHILL_EXECUTION_BINDING_STAGED_INACTIVE=true");
console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_RUNTIME_CONFIGURATION_VERIFIED=true");
console.log("AVANTIQO_MUSIC_ELASTIC_DATABASE_MUTATION_PERFORMED=true");
console.log("AVANTIQO_MUSIC_ELASTIC_ORGANIZATION_SERVICE_MUTATION_PERFORMED=true");
console.log("AVANTIQO_MUSIC_ELASTIC_PRICING_MUTATION_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_WALLET_MUTATION_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_PROVIDER_JOB_SUBMITTED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_ENDPOINT_MUTATION_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_DEPLOY_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_DEPLOY_REQUIRED_BEFORE_LIVE_RUNTIME=true");
console.log("AVANTIQO_MUSIC_ELASTIC_NEXT=RUN_CHURCHILL_ELASTIC_GENERATION_FREE_RUNTIME_READINESS_AUDIT");
