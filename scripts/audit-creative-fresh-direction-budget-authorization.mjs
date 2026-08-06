#!/usr/bin/env node

import process from "node:process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });

process.env.CREATIVE_ALLOW_AUTOMATIC_REPAIR = "false";
process.env.CREATIVE_APPROVED_INCREMENTAL_REPAIR_BUDGET = "0";
process.env.REPAIR_EXECUTION_AUTHORIZED = "false";
process.env.PUBLICATION_AUTHORIZED = "false";
process.env.CREATIVE_FRESH_DIRECTION_AUTHORIZED = "false";
process.env.CREATIVE_PROVIDER_EXECUTION_AUTHORIZED = "false";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round6(value) {
  return Number(Number(value).toFixed(6));
}

function ceil6(value) {
  return Math.ceil((Number(value) - Number.EPSILON) * 1_000_000) / 1_000_000;
}

function projectDuration(project = {}, brief = {}) {
  const metadata = object(project.metadata);
  return finite(
    metadata.temporal_contract?.duration_seconds ??
    metadata.temporalContract?.duration_seconds ??
    metadata.full_master_duration ??
    metadata.full_song_duration_seconds ??
    metadata.creative_direction_constraints?.full_song_duration_seconds ??
    brief.duration_seconds ??
    brief.target_duration ??
    project.target_duration,
  );
}

function fullSourceAudioIntent(project = {}, brief = {}) {
  const projectMetadata = object(project.metadata);
  const briefMetadata = object(brief.metadata);
  const mode = text(
    projectMetadata.duration_mode ||
    projectMetadata.durationMode ||
    projectMetadata.temporal_contract?.mode ||
    projectMetadata.temporalContract?.mode ||
    briefMetadata.duration_mode ||
    briefMetadata.temporal_contract?.mode,
  ).toUpperCase();

  if ([
    "FULL_SOURCE_AUDIO",
    "FULL_SONG",
    "MATCH_SOURCE_AUDIO",
    "SOURCE_AUDIO",
  ].includes(mode)) return true;

  if (
    projectMetadata.full_song === true ||
    projectMetadata.fullSong === true ||
    projectMetadata.music_video === true ||
    projectMetadata.musicVideo === true ||
    briefMetadata.full_song === true ||
    briefMetadata.music_video === true
  ) return true;

  const corpus = [
    project.name,
    project.description,
    project.objective,
    brief.creative_objective,
    brief.business_goal,
    projectMetadata.request,
    projectMetadata.request_text,
    projectMetadata.creative_request,
    projectMetadata.production_intent,
  ].map(text).filter(Boolean).join(" ").toLowerCase();

  return /\b(music video|official video|full song|entire song|whole song|complete song|song-length|full-length song)\b/i.test(
    corpus,
  );
}

function effectiveSceneRange(duration) {
  if (duration <= 15) {
    return { minimum: 3, preferred: 3, maximum: 3 };
  }
  if (duration <= 30) {
    return { minimum: 3, preferred: 4, maximum: 5 };
  }
  const preferred = Math.max(6, Math.min(20, Math.round(duration / 14)));
  return {
    minimum: Math.max(5, preferred - 2),
    preferred,
    maximum: Math.min(24, preferred + 3),
  };
}

function pricingCost(pricing = {}, {
  inputTokens = 0,
  outputTokens = 0,
  quantity = 1,
} = {}) {
  const inputRate = finite(pricing.input_cost_per_1m, 0);
  const outputRate = finite(pricing.output_cost_per_1m, 0);
  const unitCost = finite(pricing.cost_per_unit, 0);
  const markupPercent = finite(pricing.markup_percent, 0);
  const supplierUnrounded =
    (Number(inputTokens) * inputRate) / 1_000_000 +
    (Number(outputTokens) * outputRate) / 1_000_000 +
    unitCost * Number(quantity);
  const supplierCost = round6(supplierUnrounded);
  const customerPrice = round6(
    supplierCost * (1 + markupPercent / 100),
  );
  return {
    supplier_unrounded: supplierUnrounded,
    supplier_cost: supplierCost,
    customer_price: customerPrice,
  };
}

const sourceGraphId = text(
  process.env.SOURCE_PRODUCTION_GRAPH_ID ||
  process.env.PRODUCTION_GRAPH_ID ||
  process.argv[2],
);
if (!sourceGraphId) throw new Error("SOURCE_PRODUCTION_GRAPH_ID_REQUIRED");

const [
  ProductionGraphRepository,
  CreativeProjectRepository,
  { CreativeMissionRuntime },
  { CreativeBriefRuntime },
  { WalletRepository },
  { getProviderPricingById },
] = await Promise.all([
  import("@/lib/creative/production-graph/repositories/ProductionGraphRepository"),
  import("@/lib/creative/projects/repositories/CreativeProjectRepository"),
  import("@/lib/creative/missions/runtime/CreativeMissionRuntime"),
  import("@/lib/creative/brief/runtime/CreativeBriefRuntime"),
  import("@/lib/platform/service-runtime/wallet/repositories/WalletRepository"),
  import("@/lib/platform/service-runtime/pricing/repositories/ProviderPricingRepository"),
]);

const graph = await ProductionGraphRepository.getById(sourceGraphId);
if (!graph) throw new Error(`SOURCE_PRODUCTION_GRAPH_NOT_FOUND:${sourceGraphId}`);

const organizationId = text(graph.organization_id);
const projectId = text(graph.creative_project_id);
if (!organizationId || !projectId) {
  throw new Error("SOURCE_PRODUCTION_GRAPH_SCOPE_INCOMPLETE");
}

const project = await CreativeProjectRepository.getById(projectId);
if (!project || text(project.organization_id) !== organizationId) {
  throw new Error("CREATIVE_PROJECT_NOT_FOUND_IN_SOURCE_SCOPE");
}

const missionId = text(project.creative_mission_id || graph.creative_mission_id);
if (!missionId) throw new Error("CREATIVE_MISSION_ID_REQUIRED");

const [mission, briefs, wallet] = await Promise.all([
  CreativeMissionRuntime.get(missionId),
  CreativeBriefRuntime.list({
    organization_id: organizationId,
    creative_project_id: projectId,
    creative_mission_id: missionId,
  }),
  WalletRepository.getByOrganization(organizationId),
]);

if (!mission || text(mission.organization_id) !== organizationId) {
  throw new Error("CREATIVE_MISSION_NOT_FOUND_IN_SOURCE_SCOPE");
}
const brief = briefs[0] || {};
if (!brief.id) throw new Error("CREATIVE_BRIEF_REQUIRED");

const currentApproval = object(project.metadata?.paid_direction_approval);
const pricingId = text(currentApproval.pricing_id);
if (!pricingId) throw new Error("PAID_DIRECTION_PRICING_ID_REQUIRED");

const pricing = await getProviderPricingById(pricingId);
if (!pricing || pricing.active !== true) {
  throw new Error(`ACTIVE_PRICING_NOT_FOUND:${pricingId}`);
}

const provider = text(pricing.provider);
const model = text(pricing.model);
const currency = text(pricing.currency).toUpperCase();
if (!provider || !model || !currency) {
  throw new Error("PAID_DIRECTION_PRICING_SCOPE_INCOMPLETE");
}
if (provider !== text(currentApproval.provider)) {
  throw new Error("PAID_DIRECTION_PROVIDER_CHANGED");
}
if (model !== text(currentApproval.model)) {
  throw new Error("PAID_DIRECTION_MODEL_CHANGED");
}
if (currency !== text(currentApproval.currency).toUpperCase()) {
  throw new Error("PAID_DIRECTION_CURRENCY_CHANGED");
}

const duration = projectDuration(project, brief);
if (!duration || duration <= 0) {
  throw new Error("CREATIVE_TEMPORAL_DURATION_REQUIRED");
}

const sourceAudioIntent = fullSourceAudioIntent(project, brief);
const scenes = effectiveSceneRange(duration);
const conceptCouncilCalls = 9;
const fixedTemporalCalls = 2;
const synthesisCalls = sourceAudioIntent ? 1 : 0;
const maximumCalls =
  synthesisCalls + fixedTemporalCalls + scenes.maximum + conceptCouncilCalls;

const maximumRequestedOutputTokens =
  synthesisCalls * 12000 +
  16000 +
  14000 +
  scenes.maximum * 15000 +
  73000;

const maximumSingleCallOutputTokens = 16000;
const maximumPromptCharacters = 1_000_000;
const maximumTotalPromptCharacters = 3_000_000;

const maximumSingleCallInputTokens =
  Math.ceil(maximumPromptCharacters / 3) + 512;
const maximumAggregateInputTokens =
  Math.ceil(maximumTotalPromptCharacters / 3) +
  maximumCalls * 512 +
  maximumCalls;

const perCall = pricingCost(pricing, {
  inputTokens: maximumSingleCallInputTokens,
  outputTokens: maximumSingleCallOutputTokens,
  quantity: 1,
});

const aggregate = pricingCost(pricing, {
  inputTokens: maximumAggregateInputTokens,
  outputTokens: maximumRequestedOutputTokens,
  quantity: maximumCalls,
});

const roundingBuffer = maximumCalls * 0.000002;
const maximumPerCallCustomerPrice = ceil6(perCall.customer_price);
const maximumCustomerPrice = ceil6(
  aggregate.supplier_unrounded *
  (1 + finite(pricing.markup_percent, 0) / 100) +
  roundingBuffer,
);

const walletCurrency = text(wallet?.currency).toUpperCase();
const availableBalance = finite(wallet?.available_balance, 0);
const walletExists = Boolean(wallet?.id);
const walletCurrencyMatches = walletExists && walletCurrency === currency;
const walletSufficient =
  walletExists &&
  walletCurrencyMatches &&
  availableBalance >= maximumCustomerPrice;
const fundingGap = round6(
  Math.max(0, maximumCustomerPrice - availableBalance),
);

const commandIdentity = text(project.metadata?.command_identity);
const requiredOperations = [
  ...(sourceAudioIntent
    ? ["UNIVERSAL_MUSIC_WORLD_IDENTITY_SYNTHESIS_V1"]
    : []),
  "TEMPORAL_MASTER_PLAN_BASE_V1",
  "TEMPORAL_SCENE_ARCHITECTURE_V1",
  "TEMPORAL_SCENE_SHOT_DIRECTION_V1",
  "CREATIVE_CONCEPT_DIRECTOR_*",
  "CREATIVE_CONCEPT_CRITIC_*",
  "CREATIVE_EXECUTIVE_CONCEPT_SELECTION_V1",
  "CREATIVE_SELECTED_CONCEPT_PLAN_REVISION_V1",
];

const proposedReasoningBudget = {
  contract: "CREATIVE_REASONING_BUDGET_V1",
  maximum_calls: maximumCalls,
  maximum_requested_output_tokens: maximumRequestedOutputTokens,
  maximum_single_call_output_tokens: maximumSingleCallOutputTokens,
  maximum_prompt_characters: maximumPromptCharacters,
  maximum_total_prompt_characters: maximumTotalPromptCharacters,
  maximum_customer_price: maximumCustomerPrice,
  currency,
};

const proposedApproval = {
  contract: "CREATIVE_DIRECTION_BUDGET_APPROVAL_V2",
  id: "GENERATE_ON_EXPLICIT_AUTHORIZATION",
  approved: false,
  status: "PROPOSED_NOT_AUTHORIZED",
  provider,
  model,
  pricing_id: pricingId,
  currency,
  maximum_customer_price: maximumCustomerPrice,
  maximum_per_call_customer_price: maximumPerCallCustomerPrice,
  maximum_calls: maximumCalls,
  call_count: 0,
  spent_customer_price: 0,
  remaining_customer_price: maximumCustomerPrice,
  operations: [],
  allowed_operations: requiredOperations,
  command_identity: commandIdentity || null,
  approval_duration_minutes: 90,
};

const blockers = [];
if (!commandIdentity) blockers.push("PROJECT_COMMAND_IDENTITY_REQUIRED");
if (!walletExists) blockers.push("ORGANIZATION_WALLET_NOT_FOUND");
if (walletExists && !walletCurrencyMatches) {
  blockers.push(`WALLET_CURRENCY_MISMATCH:${walletCurrency || "MISSING"}:${currency}`);
}
if (!walletSufficient) {
  blockers.push(
    `WALLET_BALANCE_INSUFFICIENT:${availableBalance}:${maximumCustomerPrice}:${fundingGap}`,
  );
}
if (maximumCalls !== 20) {
  blockers.push(`UNEXPECTED_MAXIMUM_CALL_COUNT:${maximumCalls}:20`);
}
if (maximumRequestedOutputTokens !== 238000) {
  blockers.push(
    `UNEXPECTED_MAXIMUM_OUTPUT_TOKEN_COUNT:${maximumRequestedOutputTokens}:238000`,
  );
}

console.log("============================================================");
console.log("FRESH DIRECTION BUDGET AUTHORIZATION AUDIT");
console.log("============================================================");
console.log(`SOURCE_GRAPH_ID=${sourceGraphId}`);
console.log("SOURCE_GRAPH_USAGE=READ_ONLY_PROJECT_LOCATOR_ONLY");
console.log(`ORGANIZATION_ID=${organizationId}`);
console.log(`CREATIVE_PROJECT_ID=${projectId}`);
console.log(`CREATIVE_MISSION_ID=${missionId}`);
console.log(`COMMAND_IDENTITY=${commandIdentity || "MISSING"}`);
console.log(`TARGET_DURATION_SECONDS=${duration}`);
console.log(`SOURCE_AUDIO_INTENT=${sourceAudioIntent ? "YES" : "NO"}`);
console.log(`MAXIMUM_SCENE_COUNT=${scenes.maximum}`);
console.log(`MAXIMUM_REASONING_CALLS=${maximumCalls}`);
console.log(`MAXIMUM_REQUESTED_OUTPUT_TOKENS=${maximumRequestedOutputTokens}`);
console.log(`MAXIMUM_SINGLE_CALL_OUTPUT_TOKENS=${maximumSingleCallOutputTokens}`);
console.log(`MAXIMUM_PROMPT_CHARACTERS_PER_CALL=${maximumPromptCharacters}`);
console.log(`MAXIMUM_TOTAL_PROMPT_CHARACTERS=${maximumTotalPromptCharacters}`);
console.log(`MAXIMUM_SINGLE_CALL_ESTIMATED_INPUT_TOKENS=${maximumSingleCallInputTokens}`);
console.log(`MAXIMUM_AGGREGATE_ESTIMATED_INPUT_TOKENS=${maximumAggregateInputTokens}`);
console.log(`PRICING_ID=${pricingId}`);
console.log(`PRICING_PROVIDER=${provider}`);
console.log(`PRICING_MODEL=${model}`);
console.log(`PRICING_CURRENCY=${currency}`);
console.log(`PRICING_INPUT_COST_PER_1M=${finite(pricing.input_cost_per_1m, 0)}`);
console.log(`PRICING_OUTPUT_COST_PER_1M=${finite(pricing.output_cost_per_1m, 0)}`);
console.log(`PRICING_COST_PER_UNIT=${finite(pricing.cost_per_unit, 0)}`);
console.log(`PRICING_MARKUP_PERCENT=${finite(pricing.markup_percent, 0)}`);
console.log(`MAXIMUM_PER_CALL_CUSTOMER_PRICE=${maximumPerCallCustomerPrice}`);
console.log(`MAXIMUM_TOTAL_CUSTOMER_PRICE=${maximumCustomerPrice}`);
console.log(`ROUNDING_SAFETY_BUFFER=${roundingBuffer}`);
console.log(`WALLET_EXISTS=${walletExists ? "YES" : "NO"}`);
console.log(`WALLET_ID=${wallet?.id || "NONE"}`);
console.log(`WALLET_CURRENCY=${walletCurrency || "MISSING"}`);
console.log(`WALLET_AVAILABLE_BALANCE=${availableBalance}`);
console.log(`WALLET_REQUIRED_BALANCE=${maximumCustomerPrice}`);
console.log(`WALLET_FUNDING_GAP=${fundingGap}`);
console.log(`WALLET_SUFFICIENT=${walletSufficient ? "YES" : "NO"}`);
console.log(`REQUIRED_OPERATIONS=${JSON.stringify(requiredOperations)}`);
console.log(`PROPOSED_REASONING_BUDGET=${JSON.stringify(proposedReasoningBudget)}`);
console.log(`PROPOSED_PAID_DIRECTION_APPROVAL=${JSON.stringify(proposedApproval)}`);
console.log("APPROVAL_ACTIVATED=NO");
console.log("FRESH_DIRECTION_AUTHORIZED=NO");
console.log("REASONING_PROVIDER_EXECUTION_AUTHORIZED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("WALLET_CHANGED=NO");
console.log("WALLET_ROW_CREATED=NO");
console.log("USAGE_ROWS_CREATED=NO");
console.log("BILLING_ROWS_CREATED=NO");
console.log("PROJECT_ROWS_CHANGED=NO");
console.log("GRAPH_CREATED=NO");
console.log("TASKS_CREATED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("============================================================");
console.log("BUDGET AUTHORIZATION RESULT");
console.log("============================================================");
console.log(`BUDGET_AUTHORIZATION_SAFE_TO_REQUEST=${blockers.length ? "NO" : "YES"}`);
console.log(`BUDGET_AUTHORIZATION_BLOCKER_COUNT=${blockers.length}`);
console.log(`BUDGET_AUTHORIZATION_BLOCKERS=${JSON.stringify(blockers)}`);

if (blockers.length) process.exitCode = 2;
