#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";
import { getPlatformAIService } from "../lib/platform/service-runtime/ai/PlatformAIServiceCatalog.js";
import { ownedProviderForCapability } from "../lib/platform/service-runtime/providers/AvantiqoOwnedProviderPolicy.js";
import { ownedExecutionCertification } from "../lib/platform/service-runtime/providers/AvantiqoOwnedCertificationPolicy.js";

loadAvantiqoEnv();

const CONTRACT = "AVANTIQO_MUSIC_ELASTIC_CHURCHILL_EXECUTION_BINDING_PLAN_V2";
const CAPABILITY = "ai.audio.elastic-warp";
const PROVIDER = "avantiqo-audio";
const MODEL = "signalsmith-stretch";
const CURRENCY = "THB";
const CHURCHILL_ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const PRODUCTION_PROJECT_REF = "vfsjqabpkcbiuerhzugk";
const EXPECTED_ENDPOINT_ID = "9hl8bjuce4n4bm";
const EXPECTED_VERCEL_PROJECT_ID = "prj_5K2x3kGkhs3d2PU8VOQQPyNT24A9";
const EXPECTED_VERCEL_ORG_ID = "team_40jy42BqQOs4U6pVdkawwEfp";
const PRICING_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_PRODUCTION_PRICING_V1";
const REVIEWER_REPAIR_CONTRACT = "AVANTIQO_MUSIC_ELASTIC_HUMAN_QUALITY_REVIEWER_REPAIR_V3";
const PLATFORM_ENTITLEMENT = "PLATFORM_STANDARD";
const ENDPOINT_ENV = "RUNPOD_AVANTIQO_MUSIC_ELASTIC_ENDPOINT_ID";
const ENABLED_ENV = "AVANTIQO_MUSIC_ELASTIC_ENGINE_ENABLED";
const CERTIFIED_ENV = "AVANTIQO_MUSIC_ELASTIC_ENGINE_CERTIFIED";
const RUNPOD_KEY_ENV = "RUNPOD_API_KEY";

const text = (value) => String(value ?? "").trim();
const finite = (value, fallback = null) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const hashText = (value) => crypto.createHash("sha256").update(text(value), "utf8").digest("hex");

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name}_REQUIRED`);
  return value;
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

function sourceIncludes(relativePath, needles) {
  const source = fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
  return needles.every((needle) => source.includes(needle));
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
  engine_enabled_present: Object.prototype.hasOwnProperty.call(process.env, "${ENABLED_ENV}"),
  engine_enabled_true: on(process.env.${ENABLED_ENV}),
  engine_certified_present: Object.prototype.hasOwnProperty.call(process.env, "${CERTIFIED_ENV}"),
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

if (process.argv.includes("--apply")) throw new Error(`${CONTRACT}_APPLY_FORBIDDEN_PLAN_ONLY`);

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

runVercel(["--version"]);
const productionRuntime = readProductionRuntimeState();

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const platformService = getPlatformAIService(CAPABILITY);
const ownedProvider = ownedProviderForCapability(CAPABILITY);
const sourceContracts = {
  platform_standard_entitlement: sourceIncludes(
    "lib/platform/service-runtime/services/resolver/OrganizationServiceResolver.js",
    ["PLATFORM_STANDARD", "platformAiEntitlements", "PLATFORM_AI_SERVICES"],
  ),
  execution_runtime_requires_binding: sourceIncludes(
    "lib/platform/service-runtime/execution/ServiceExecutionRuntime.js",
    ["OrganizationServiceRuntime.get", "organization_service_id: organizationService.id", "Service ${service_id} is not enabled for organization"],
  ),
  platform_service_capability_mapping: sourceIncludes(
    "lib/platform/service-runtime/services/resolver/ServiceCapabilityResolver.js",
    ["getPlatformAIService(serviceId)", "platform_ai_service", "platformService.id"],
  ),
  elastic_route_uses_service_runtime: sourceIncludes(
    "app/api/creative/music/elastic-audio/route.js",
    ["service_id: CAPABILITY", "capability: CAPABILITY", "executeService({"],
  ),
  production_runtime_promotion_contract: sourceIncludes(
    "scripts/promote-avantiqo-music-elastic-production-runtime-local.mjs",
    [
      "AVANTIQO_MUSIC_ELASTIC_PRODUCTION_RUNTIME_PROMOTION_V1",
      '"env", "run", "-e", "production"',
      "effective_on_next_production_deployment: true",
    ],
  ),
};

const [pricingResult, churchillBindingResult, globalBindingResult, referenceServiceResult, walletResult] = await Promise.all([
  supabase.from("provider_pricing").select("*")
    .eq("provider", PROVIDER).eq("capability", CAPABILITY).eq("model", MODEL).eq("currency", CURRENCY),
  supabase.from("organization_services").select("*")
    .eq("organization_id", CHURCHILL_ORGANIZATION_ID).eq("service_id", CAPABILITY),
  supabase.from("organization_services").select("id,organization_id,service_id,status,usage_enabled,billing_enabled")
    .eq("service_id", CAPABILITY),
  supabase.from("organization_services").select("*")
    .eq("organization_id", CHURCHILL_ORGANIZATION_ID).eq("service_id", "ai.music.generate"),
  supabase.from("organization_wallets")
    .select("id,organization_id,entity_id,currency,default_currency,available_balance,reserved_balance,billing_policy,wallet_type,status,allow_negative,minimum_balance")
    .eq("organization_id", CHURCHILL_ORGANIZATION_ID).eq("currency", CURRENCY),
]);

for (const [name, result] of Object.entries({ pricing: pricingResult, churchill_binding: churchillBindingResult, global_binding: globalBindingResult, reference_service: referenceServiceResult, wallet: walletResult })) {
  if (result.error) throw new Error(`${CONTRACT}_${name.toUpperCase()}_READ_FAILED:${result.error.message}`);
}

const pricingRows = pricingResult.data || [];
const churchillBindings = churchillBindingResult.data || [];
const globalBindings = globalBindingResult.data || [];
const referenceServices = referenceServiceResult.data || [];
const wallets = walletResult.data || [];
if (pricingRows.length !== 1) throw new Error(`${CONTRACT}_EXACT_PRICING_ROW_REQUIRED:count=${pricingRows.length}`);
if (churchillBindings.length > 1) throw new Error(`${CONTRACT}_DUPLICATE_CHURCHILL_BINDINGS:${churchillBindings.length}`);
if (referenceServices.length !== 1) throw new Error(`${CONTRACT}_REFERENCE_MUSIC_SERVICE_REQUIRED:count=${referenceServices.length}`);
if (wallets.length !== 1) throw new Error(`${CONTRACT}_EXACT_THB_WALLET_REQUIRED:count=${wallets.length}`);

const pricing = pricingRows[0];
const pricingMetadata = pricing.metadata && typeof pricing.metadata === "object" ? pricing.metadata : {};
const referenceService = referenceServices[0];
const wallet = wallets[0];
const reviewer = text(pricingMetadata.human_quality_reviewer);
const certification = ownedExecutionCertification({
  provider: { id: PROVIDER, metadata: { configured_foundation_model: MODEL, foundation_models: [MODEL] } },
  capability: CAPABILITY,
  pricing,
});
const oneSecondCustomerPrice = finite(
  pricingMetadata.customer_price_thb_per_second,
  finite(pricing.cost_per_unit, 0) * (1 + finite(pricing.markup_percent, 0) / 100),
);
const availableBalance = finite(wallet.available_balance, 0);
const minimumBalance = finite(wallet.minimum_balance, 0);

const blockers = [];
const requireCheck = (name, condition) => { if (!condition) blockers.push(name); };
requireCheck("PLATFORM_AI_CATALOG_ENTRY_REQUIRED", Boolean(platformService));
requireCheck("PLATFORM_AI_CATALOG_ID_MISMATCH", text(platformService?.id) === CAPABILITY);
requireCheck("PLATFORM_AI_CATALOG_CATEGORY_MISMATCH", text(platformService?.category) === "ai");
requireCheck("PLATFORM_STANDARD_ENTITLEMENT_SOURCE_CONTRACT_REQUIRED", sourceContracts.platform_standard_entitlement === true);
requireCheck("SERVICE_EXECUTION_BINDING_SOURCE_CONTRACT_REQUIRED", sourceContracts.execution_runtime_requires_binding === true);
requireCheck("SERVICE_CAPABILITY_MAPPING_SOURCE_CONTRACT_REQUIRED", sourceContracts.platform_service_capability_mapping === true);
requireCheck("ELASTIC_ROUTE_SERVICE_RUNTIME_SOURCE_CONTRACT_REQUIRED", sourceContracts.elastic_route_uses_service_runtime === true);
requireCheck("PRODUCTION_RUNTIME_PROMOTION_SOURCE_CONTRACT_REQUIRED", sourceContracts.production_runtime_promotion_contract === true);
requireCheck("OWNED_PROVIDER_POLICY_REQUIRED", ownedProvider === PROVIDER);
requireCheck("PRODUCTION_ELASTIC_ENGINE_ENABLED_REQUIRED", productionRuntime.engine_enabled_true === true);
requireCheck("PRODUCTION_ELASTIC_ENGINE_CERTIFIED_REQUIRED", productionRuntime.engine_certified_true === true);
requireCheck("PRODUCTION_ELASTIC_ENDPOINT_REQUIRED", productionRuntime.endpoint_present === true);
requireCheck("PRODUCTION_ELASTIC_ENDPOINT_MISMATCH", productionRuntime.endpoint_matches_expected === true);
requireCheck("PRODUCTION_RUNPOD_API_KEY_REQUIRED", productionRuntime.runpod_api_key_present === true);
requireCheck("PRICING_ACTIVE_REQUIRED", pricing.active === true);
requireCheck("PRICING_CONTRACT_REQUIRED", text(pricingMetadata.pricing_contract) === PRICING_CONTRACT);
requireCheck("PRICING_STATUS_PRODUCTION_CERTIFIED_REQUIRED", text(pricingMetadata.pricing_status) === "PRODUCTION_CERTIFIED");
requireCheck("PRICING_ROUTING_ALLOWED_REQUIRED", pricingMetadata.production_routing_allowed === true);
requireCheck("PRICING_CAPABILITY_BINDING_REQUIRED", text(pricingMetadata.certified_capability) === CAPABILITY);
requireCheck("PRICING_MODEL_BINDING_REQUIRED", text(pricingMetadata.certified_model) === MODEL);
requireCheck("REVIEWER_IDENTITY_VALID_REQUIRED", reviewerIdentityValid(reviewer));
requireCheck("REVIEWER_EXPLICIT_OPERATOR_SOURCE_REQUIRED", text(pricingMetadata.human_quality_reviewer_identity_source) === "EXPLICIT_OPERATOR_INPUT");
requireCheck("REVIEWER_V3_REPAIR_BINDING_REQUIRED", text(pricingMetadata.human_quality_reviewer_repair_contract) === REVIEWER_REPAIR_CONTRACT);
requireCheck("OWNED_EXECUTION_CERTIFICATION_REQUIRED", certification?.eligible === true);
requireCheck("REFERENCE_MUSIC_SERVICE_ACTIVE_REQUIRED", text(referenceService.status).toUpperCase() === "ACTIVE");
requireCheck("REFERENCE_MUSIC_SERVICE_ENTITY_REQUIRED", Boolean(text(referenceService.entity_id)));
requireCheck("REFERENCE_MUSIC_SERVICE_AVANTIQO_MANAGED_REQUIRED", text(referenceService.managed_by).toLowerCase() === "avantiqo");
requireCheck("THB_WALLET_ACTIVE_REQUIRED", text(wallet.status).toUpperCase() === "ACTIVE");
requireCheck("THB_WALLET_PREPAID_POLICY_REQUIRED", text(wallet.billing_policy).toUpperCase() === "PREPAID");
requireCheck("THB_WALLET_PREPAID_TYPE_REQUIRED", text(wallet.wallet_type).toUpperCase() === "PREPAID");
requireCheck("THB_WALLET_NEGATIVE_FORBIDDEN_REQUIRED", wallet.allow_negative === false);
requireCheck("THB_WALLET_DEFAULT_CURRENCY_REQUIRED", text(wallet.default_currency).toUpperCase() === CURRENCY);
requireCheck("THB_WALLET_ENTITY_MATCH_REQUIRED", text(wallet.entity_id) === text(referenceService.entity_id));
requireCheck("ONE_SECOND_CUSTOMER_PRICE_REQUIRED", oneSecondCustomerPrice > 0);
requireCheck("THB_WALLET_RESERVATION_HEADROOM_REQUIRED", availableBalance - minimumBalance >= oneSecondCustomerPrice);

const proposedBinding = {
  organization_id: CHURCHILL_ORGANIZATION_ID,
  entity_id: referenceService.entity_id,
  party_id: null,
  service_category_id: "ai",
  service_id: CAPABILITY,
  solution_id: null,
  package_id: referenceService.package_id || "creative",
  status: "ACTIVE",
  managed_by: "avantiqo",
  authorization_required: true,
  usage_enabled: true,
  billing_enabled: true,
  health: "UNKNOWN",
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
  configuration: {
    execution_binding_contract: CONTRACT,
    entitlement_source: PLATFORM_ENTITLEMENT,
    owned_provider_required: PROVIDER,
    external_fallback_allowed: false,
    production_runtime_configuration_verified: true,
    production_runtime_effective_on_next_deployment: true,
  },
  metadata: {
    source: CONTRACT,
    purpose: "SERVICE_EXECUTION_RUNTIME_USAGE_LEDGER_BINDING",
    execution_binding_only: true,
    customer_entitlement_gate: false,
    entitlement_source: PLATFORM_ENTITLEMENT,
    platform_ai_service: true,
    capability: CAPABILITY,
    provider: PROVIDER,
    model: MODEL,
    pricing_id: pricing.id,
    pricing_contract: PRICING_CONTRACT,
    pricing_status: pricingMetadata.pricing_status,
    human_quality_reviewer: reviewer,
    human_quality_reviewed_at: pricingMetadata.human_quality_reviewed_at || null,
    automatic_apply_forbidden: true,
    musician_approved_warp_plan_required: true,
    production_runtime_configuration_verified: true,
    production_deploy_required_before_live_runtime: true,
  },
};

let proposedOperation = "INSERT";
if (churchillBindings.length === 1) {
  const existing = churchillBindings[0];
  const existingMetadata = existing.metadata && typeof existing.metadata === "object" ? existing.metadata : {};
  const exactCompatible = (
    text(existing.organization_id) === CHURCHILL_ORGANIZATION_ID &&
    text(existing.service_id) === CAPABILITY &&
    text(existing.status).toUpperCase() === "ACTIVE" &&
    existing.usage_enabled !== false && existing.billing_enabled !== false &&
    text(existing.managed_by).toLowerCase() === "avantiqo" &&
    text(existing.entity_id) === text(referenceService.entity_id) &&
    text(existing.default_provider_id) === PROVIDER && existing.fallback_enabled === false &&
    text(existing.default_currency).toUpperCase() === CURRENCY && text(existing.default_model) === MODEL &&
    existingMetadata.execution_binding_only === true && existingMetadata.customer_entitlement_gate === false &&
    text(existingMetadata.entitlement_source) === PLATFORM_ENTITLEMENT
  );
  if (exactCompatible) proposedOperation = "NOOP";
  else blockers.push("EXISTING_CHURCHILL_ELASTIC_BINDING_REQUIRES_EXPLICIT_REVIEW");
}

const planReady = blockers.length === 0;
const output = {
  success: planReady,
  contract: CONTRACT,
  mode: "PLAN",
  production_project_ref: projectRef,
  vercel: {
    project_id: EXPECTED_VERCEL_PROJECT_ID,
    organization_id: EXPECTED_VERCEL_ORG_ID,
    environment: "production",
  },
  organization: { id: CHURCHILL_ORGANIZATION_ID, entity_id: referenceService.entity_id },
  capability: CAPABILITY,
  platform_entitlement: { source: PLATFORM_ENTITLEMENT, service: platformService, organization_row_is_entitlement_gate: false },
  execution_binding: {
    required_by_current_service_runtime: sourceContracts.execution_runtime_requires_binding,
    purpose: "SERVICE_EXECUTION_RUNTIME_USAGE_LEDGER_BINDING",
    proposed_operation: proposedOperation,
    existing_churchill_row_count: churchillBindings.length,
    existing_global_row_count: globalBindings.length,
    proposed_row: proposedBinding,
  },
  production_runtime_configuration: {
    source: "VERCEL_PRODUCTION_ENV",
    engine_enabled_present: productionRuntime.engine_enabled_present,
    engine_enabled: productionRuntime.engine_enabled_true,
    engine_certified_present: productionRuntime.engine_certified_present,
    engine_certified: productionRuntime.engine_certified_true,
    endpoint_configured: productionRuntime.endpoint_present,
    endpoint_sha256: productionRuntime.endpoint_sha256,
    endpoint_matches_certified: productionRuntime.endpoint_matches_expected,
    runpod_api_key_configured: productionRuntime.runpod_api_key_present,
    effective_on_next_production_deployment: true,
    current_production_deployment_rebuilt: false,
    provider_job_submitted: false,
    endpoint_mutation_performed: false,
  },
  pricing: {
    id: pricing.id, active: pricing.active, provider: pricing.provider, model: pricing.model,
    capability: pricing.capability, currency: pricing.currency, unit: pricing.unit,
    supplier_cost_per_second: finite(pricing.cost_per_unit, null), customer_price_per_second: oneSecondCustomerPrice,
    reviewer, owned_execution_certification: certification,
  },
  wallet: {
    id: wallet.id, currency: wallet.currency, default_currency: wallet.default_currency,
    billing_policy: wallet.billing_policy, wallet_type: wallet.wallet_type, status: wallet.status,
    allow_negative: wallet.allow_negative, available_balance: availableBalance,
    reserved_balance: finite(wallet.reserved_balance, 0), minimum_balance: minimumBalance,
    one_second_reservation_affordable: availableBalance - minimumBalance >= oneSecondCustomerPrice,
    wallet_mutation_performed: false,
  },
  source_contracts: sourceContracts,
  plan_ready: planReady,
  blockers,
  database_mutation_performed: false,
  organization_service_mutation_performed: false,
  pricing_mutation_performed: false,
  wallet_mutation_performed: false,
  provider_job_submitted: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
  next_action: planReady
    ? proposedOperation === "NOOP" ? "AUDIT_CHURCHILL_ELASTIC_RUNTIME_READINESS" : "BUILD_EXPLICIT_CHURCHILL_ELASTIC_EXECUTION_BINDING_APPLY_GATE"
    : "RESOLVE_CHURCHILL_ELASTIC_EXECUTION_BINDING_PLAN_V2_BLOCKERS",
};

const outputPath = path.join(os.tmpdir(), `avantiqo-music-elastic-churchill-execution-binding-plan-v2-${Date.now()}.json`);
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ...output, output_path: outputPath }, null, 2));
console.log(`AVANTIQO_MUSIC_ELASTIC_CHURCHILL_EXECUTION_BINDING_PLAN_V2=${planReady ? "PASS" : "BLOCKED"}`);
console.log(`AVANTIQO_MUSIC_ELASTIC_CHURCHILL_EXECUTION_BINDING_PLAN_V2_READY=${planReady}`);
console.log(`AVANTIQO_MUSIC_ELASTIC_CHURCHILL_EXECUTION_BINDING_OPERATION=${proposedOperation}`);
console.log(`AVANTIQO_MUSIC_ELASTIC_PLATFORM_ENTITLEMENT=${PLATFORM_ENTITLEMENT}`);
console.log(`AVANTIQO_MUSIC_ELASTIC_PRODUCTION_RUNTIME_CONFIGURATION_VERIFIED=${productionRuntime.engine_enabled_true && productionRuntime.engine_certified_true && productionRuntime.endpoint_matches_expected && productionRuntime.runpod_api_key_present}`);
console.log("AVANTIQO_MUSIC_ELASTIC_ORGANIZATION_SERVICE_MUTATION_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_PRICING_MUTATION_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_WALLET_MUTATION_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_PROVIDER_JOB_SUBMITTED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_ENDPOINT_MUTATION_PERFORMED=false");
console.log("AVANTIQO_MUSIC_ELASTIC_PRODUCTION_DEPLOY_PERFORMED=false");
console.log(`AVANTIQO_MUSIC_ELASTIC_CHURCHILL_EXECUTION_BINDING_PLAN_V2_OUTPUT=${outputPath}`);
console.log(`AVANTIQO_MUSIC_ELASTIC_NEXT=${output.next_action}`);
if (!planReady) process.exitCode = 2;
