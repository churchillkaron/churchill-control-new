#!/usr/bin/env node

import fs from "node:fs";
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

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function unique(values = []) {
  return [...new Set(values.flat(Infinity).map(text).filter(Boolean))];
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
  return /\b(music video|official video|full song|entire song|whole song|complete song|song-length|full-length song)\b/i.test(corpus);
}

function assetKind(asset = {}) {
  const mime = text(
    asset.mime_type ||
    asset.technical?.mime_type ||
    asset.metadata?.mime_type ||
    asset.analysis?.technical_inspection?.mime_type ||
    asset.analysis?.technical?.mime_type,
  ).toLowerCase();
  const type = text(asset.asset_type || asset.type).toLowerCase();
  const source = text(asset.url || asset.file_url || asset.image_url).toLowerCase();
  if (
    mime.startsWith("audio/") ||
    /audio|music|voice/.test(type) ||
    /\.(mp3|wav|m4a|aac|flac|ogg|opus)(\?|$)/.test(source)
  ) return "AUDIO";
  return "OTHER";
}

function baseSceneRange(duration) {
  const preferred = Math.max(6, Math.min(20, Math.round(duration / 14)));
  return {
    minimum: Math.max(5, preferred - 2),
    preferred,
    maximum: Math.min(24, preferred + 3),
  };
}

function effectiveSceneRange(duration) {
  if (duration <= 15) {
    return { minimum: 3, preferred: 3, maximum: 3, source: "SHORT_FORM_FIXED" };
  }
  if (duration <= 30) {
    return { minimum: 3, preferred: 4, maximum: 5, source: "SHORT_FORM_RANGE" };
  }
  return { ...baseSceneRange(duration), source: "TEMPORAL_MASTER_RANGE" };
}

function operationAllowed(operation, patterns = []) {
  const current = text(operation).toUpperCase();
  return list(patterns).some((patternValue) => {
    const pattern = text(patternValue).toUpperCase();
    if (!pattern) return false;
    if (pattern.endsWith("*")) return current.startsWith(pattern.slice(0, -1));
    return current === pattern;
  });
}

function findForbiddenIds(value, forbiddenIds, path = "$", matches = []) {
  if (value === null || value === undefined) return matches;
  if (typeof value === "string") {
    for (const id of forbiddenIds) {
      if (id && value.includes(id)) matches.push({ path, id });
    }
    return matches;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      findForbiddenIds(entry, forbiddenIds, `${path}[${index}]`, matches));
    return matches;
  }
  if (typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      findForbiddenIds(entry, forbiddenIds, `${path}.${key}`, matches);
    }
  }
  return matches;
}

function readSource(path) {
  return fs.readFileSync(path, "utf8");
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
  { CreativeAssetsRuntime },
  { ProductionTaskRuntime },
  { CreativeReasoningBudgetRuntime },
  { PricingRuntime },
] = await Promise.all([
  import("@/lib/creative/production-graph/repositories/ProductionGraphRepository"),
  import("@/lib/creative/projects/repositories/CreativeProjectRepository"),
  import("@/lib/creative/missions/runtime/CreativeMissionRuntime"),
  import("@/lib/creative/brief/runtime/CreativeBriefRuntime"),
  import("@/lib/creative/assets/runtime/CreativeAssetsRuntime"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/creative/reasoning/runtime/CreativeReasoningBudgetRuntime"),
  import("@/lib/platform/service-runtime/pricing/PricingRuntime"),
]);

const sourceGraph = await ProductionGraphRepository.getById(sourceGraphId);
if (!sourceGraph) throw new Error(`SOURCE_PRODUCTION_GRAPH_NOT_FOUND:${sourceGraphId}`);

const organizationId = text(sourceGraph.organization_id);
const projectId = text(sourceGraph.creative_project_id);
if (!organizationId || !projectId) {
  throw new Error("SOURCE_PRODUCTION_GRAPH_SCOPE_INCOMPLETE");
}

const project = await CreativeProjectRepository.getById(projectId);
if (!project || text(project.organization_id) !== organizationId) {
  throw new Error("CREATIVE_PROJECT_NOT_FOUND_IN_SOURCE_SCOPE");
}
const missionId = text(project.creative_mission_id || sourceGraph.creative_mission_id);
if (!missionId) throw new Error("CREATIVE_MISSION_ID_REQUIRED");

const [mission, briefs, assets, graphs, tasks] = await Promise.all([
  CreativeMissionRuntime.get(missionId),
  CreativeBriefRuntime.list({
    organization_id: organizationId,
    creative_project_id: projectId,
    creative_mission_id: missionId,
  }),
  CreativeAssetsRuntime.list({
    organization_id: organizationId,
    creative_project_id: projectId,
    creative_mission_id: missionId,
    limit: 1000,
  }),
  ProductionGraphRepository.listByProject({
    organization_id: organizationId,
    creative_project_id: projectId,
  }),
  ProductionTaskRuntime.list({
    organization_id: organizationId,
    creative_project_id: projectId,
  }),
]);

if (!mission || text(mission.organization_id) !== organizationId) {
  throw new Error("CREATIVE_MISSION_NOT_FOUND_IN_SOURCE_SCOPE");
}
const brief = briefs[0] || {};
if (!brief.id) throw new Error("CREATIVE_BRIEF_REQUIRED");

const duration = projectDuration(project, brief);
if (duration === null || duration <= 0) {
  throw new Error("CREATIVE_TEMPORAL_DURATION_REQUIRED");
}
const sceneRange = effectiveSceneRange(duration);
const audioSources = list(assets).filter((asset) => assetKind(asset) === "AUDIO");
const sourceAudioIntent = fullSourceAudioIntent(project, brief);

const currentSynthesisCalls = 1;
const hardenedSynthesisCalls = sourceAudioIntent ? 1 : 0;
const temporalFixedCalls = 2;
const councilCalls = 9;

function callRange(synthesisCalls) {
  return {
    minimum: synthesisCalls + temporalFixedCalls + sceneRange.minimum + councilCalls,
    preferred: synthesisCalls + temporalFixedCalls + sceneRange.preferred + councilCalls,
    maximum: synthesisCalls + temporalFixedCalls + sceneRange.maximum + councilCalls,
  };
}

function requestedTokenRange(synthesisCalls) {
  const fixed =
    (synthesisCalls * 12000) +
    16000 +
    14000 +
    73000;
  return {
    minimum: fixed + sceneRange.minimum * 16000,
    preferred: fixed + sceneRange.preferred * 16000,
    maximum: fixed + sceneRange.maximum * 16000,
  };
}

const currentCallRange = callRange(currentSynthesisCalls);
const hardenedCallRange = callRange(hardenedSynthesisCalls);
const currentTokenRange = requestedTokenRange(currentSynthesisCalls);
const hardenedTokenRange = requestedTokenRange(hardenedSynthesisCalls);

const reasoningBudget = CreativeReasoningBudgetRuntime.resolveBudget({
  project,
  mission,
  brief,
});

const approval = object(project.metadata?.paid_direction_approval);
let approvalPricing = null;
let approvalPricingError = null;
if (text(approval.pricing_id)) {
  try {
    approvalPricing = await PricingRuntime.resolveById({
      pricing_id: approval.pricing_id,
      currency: approval.currency || null,
      usage: { quantity: 1 },
    });
  } catch (error) {
    approvalPricingError = text(error?.message || error);
  }
}

const requiredOperations = unique([
  sourceAudioIntent ? "UNIVERSAL_MUSIC_WORLD_IDENTITY_SYNTHESIS_V1" : null,
  "TEMPORAL_MASTER_PLAN_BASE_V1",
  "TEMPORAL_SCENE_ARCHITECTURE_V1",
  "TEMPORAL_SCENE_SHOT_DIRECTION_V1",
  "CREATIVE_CONCEPT_DIRECTOR_CONCEPT-A_V1",
  "CREATIVE_CONCEPT_DIRECTOR_CONCEPT-B_V1",
  "CREATIVE_CONCEPT_DIRECTOR_CONCEPT-C_V1",
  "CREATIVE_CONCEPT_CRITIC_ORIGINALITY_V1",
  "CREATIVE_CONCEPT_CRITIC_MUSIC_ENERGY_V1",
  "CREATIVE_CONCEPT_CRITIC_BRAND_COMMERCIAL_V1",
  "CREATIVE_CONCEPT_CRITIC_PRODUCTION_V1",
  "CREATIVE_EXECUTIVE_CONCEPT_SELECTION_V1",
  "CREATIVE_SELECTED_CONCEPT_PLAN_REVISION_V1",
]);
const missingApprovedOperations = requiredOperations.filter(
  (operation) => !operationAllowed(operation, approval.allowed_operations),
);

const graphIds = unique(graphs.map((graph) => graph.id));
const taskIds = unique(tasks.map((task) => task.id));
const forbiddenIds = unique([graphIds, taskIds]);
const contextMatches = findForbiddenIds(
  { mission, project, brief, assets },
  forbiddenIds,
);

const directionOnlySource = readSource("scripts/creative-studio-fresh-direction-only.mjs");
const temporalSource = readSource(
  "lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js",
);
const universalSource = readSource(
  "lib/creative/director/runtime/CreativeUniversalTemporalDirectionRuntime.js",
);
const completionSource = readSource(
  "lib/creative/director/runtime/CreativeDirectionResultCompletionRuntime.js",
);

const staleAudioGate = directionOnlySource.includes(
  "DIRECTION_ONLY_PRIMARY_SOUNDTRACK_ASSET_REQUIRED",
);
const hardcodedSourceAudio =
  temporalSource.includes('duration_mode: "FULL_SOURCE_AUDIO"') ||
  temporalSource.includes("preserve the supplied primary soundtrack exactly") ||
  temporalSource.includes("Cover the complete source soundtrack");
const unconditionalSynthesis = universalSource.includes(
  "const synthesis = await createCreativeSynthesis({",
);
const legacyRecoveryEnabled = completionSource.includes(
  "!REPEATABLE_OPERATIONS.has(operation) && legacy.length === 1",
);
const explicitFreshRecoveryDisable = completionSource.includes(
  "CREATIVE_DIRECTION_RESULT_RECOVERY_DISABLED",
);

const blockers = [];
if (staleAudioGate && !sourceAudioIntent) {
  blockers.push("DIRECTION_ONLY_STALE_PRIMARY_SOUNDTRACK_GATE");
}
if (hardcodedSourceAudio && !sourceAudioIntent) {
  blockers.push("TEMPORAL_PLANNER_HARDCODED_SOURCE_AUDIO");
}
if (unconditionalSynthesis && !sourceAudioIntent) {
  blockers.push("NON_MUSIC_PROJECT_PAYS_MUSIC_VIDEO_SYNTHESIS_CALL");
}
if (legacyRecoveryEnabled) {
  blockers.push("LEGACY_DIRECTION_RESULT_RECOVERY_ENABLED");
}
if (!explicitFreshRecoveryDisable) {
  blockers.push("FRESH_DIRECTION_RECOVERY_DISABLE_MISSING");
}
if (contextMatches.length) {
  blockers.push(`OLD_EXECUTION_IDS_PRESENT_IN_DIRECTION_CONTEXT:${contextMatches.length}`);
}
if (reasoningBudget.maximum_calls < hardenedCallRange.maximum) {
  blockers.push(
    `REASONING_CALL_BUDGET_TOO_LOW:${reasoningBudget.maximum_calls}:${hardenedCallRange.maximum}`,
  );
}
if (
  reasoningBudget.maximum_requested_output_tokens <
  hardenedTokenRange.maximum
) {
  blockers.push(
    `REASONING_TOKEN_BUDGET_TOO_LOW:${reasoningBudget.maximum_requested_output_tokens}:${hardenedTokenRange.maximum}`,
  );
}
if (approval.contract !== "CREATIVE_DIRECTION_BUDGET_APPROVAL_V2") {
  blockers.push("PAID_DIRECTION_APPROVAL_NOT_INSTALLED");
} else {
  if (approval.approved !== true) blockers.push("PAID_DIRECTION_APPROVAL_NOT_ACTIVE");
  if (Number(approval.maximum_calls || 0) < hardenedCallRange.maximum) {
    blockers.push(
      `PAID_DIRECTION_CALL_APPROVAL_TOO_LOW:${Number(approval.maximum_calls || 0)}:${hardenedCallRange.maximum}`,
    );
  }
  if (missingApprovedOperations.length) {
    blockers.push(
      `PAID_DIRECTION_OPERATIONS_NOT_APPROVED:${missingApprovedOperations.join(",")}`,
    );
  }
  if (!approvalPricing && approvalPricingError) {
    blockers.push(`PAID_DIRECTION_PRICING_INVALID:${approvalPricingError}`);
  }
}

console.log("============================================================");
console.log("FRESH CREATIVE DIRECTION EXECUTION PREFLIGHT");
console.log("============================================================");
console.log(`SOURCE_GRAPH_ID=${sourceGraphId}`);
console.log("SOURCE_GRAPH_USAGE=READ_ONLY_PROJECT_LOCATOR_ONLY");
console.log(`ORGANIZATION_ID=${organizationId}`);
console.log(`CREATIVE_PROJECT_ID=${projectId}`);
console.log(`CREATIVE_MISSION_ID=${missionId}`);
console.log(`PROJECT_NAME=${text(project.name) || "UNNAMED"}`);
console.log(`TARGET_DURATION_SECONDS=${duration}`);
console.log(`SCENE_RANGE_SOURCE=${sceneRange.source}`);
console.log(`SCENE_COUNT_MINIMUM=${sceneRange.minimum}`);
console.log(`SCENE_COUNT_PREFERRED=${sceneRange.preferred}`);
console.log(`SCENE_COUNT_MAXIMUM=${sceneRange.maximum}`);
console.log(`DIRECTION_ASSET_COUNT=${assets.length}`);
console.log(`SOURCE_AUDIO_INTENT=${sourceAudioIntent ? "YES" : "NO"}`);
console.log(`DIRECTION_AUDIO_SOURCE_COUNT=${audioSources.length}`);
console.log(`CURRENT_REASONING_CALL_RANGE=${JSON.stringify(currentCallRange)}`);
console.log(`HARDENED_REASONING_CALL_RANGE=${JSON.stringify(hardenedCallRange)}`);
console.log(`CURRENT_REQUESTED_OUTPUT_TOKEN_RANGE=${JSON.stringify(currentTokenRange)}`);
console.log(`HARDENED_REQUESTED_OUTPUT_TOKEN_RANGE=${JSON.stringify(hardenedTokenRange)}`);
console.log(`INDEPENDENT_CONCEPT_COUNCIL_CALL_COUNT=${councilCalls}`);
console.log(`REASONING_BUDGET=${JSON.stringify({
  maximum_calls: reasoningBudget.maximum_calls,
  maximum_requested_output_tokens:
    reasoningBudget.maximum_requested_output_tokens,
  maximum_single_call_output_tokens:
    reasoningBudget.maximum_single_call_output_tokens,
  maximum_prompt_characters: reasoningBudget.maximum_prompt_characters,
  maximum_total_prompt_characters:
    reasoningBudget.maximum_total_prompt_characters,
  maximum_customer_price: reasoningBudget.maximum_customer_price,
  currency: reasoningBudget.currency,
})}`);
console.log(`PAID_DIRECTION_APPROVAL=${JSON.stringify({
  contract: approval.contract || null,
  id: approval.id || null,
  approved: approval.approved === true,
  status: approval.status || null,
  provider: approval.provider || null,
  model: approval.model || null,
  pricing_id: approval.pricing_id || null,
  currency: approval.currency || null,
  maximum_customer_price: finite(approval.maximum_customer_price),
  maximum_per_call_customer_price:
    finite(approval.maximum_per_call_customer_price),
  maximum_calls: finite(approval.maximum_calls),
  call_count: finite(approval.call_count) || 0,
  spent_customer_price: finite(approval.spent_customer_price) || 0,
  allowed_operations: list(approval.allowed_operations),
  approved_at: approval.approved_at || null,
  expires_at: approval.expires_at || null,
})}`);
console.log(`PAID_DIRECTION_BASELINE_PRICING=${JSON.stringify(approvalPricing)}`);
console.log(`PAID_DIRECTION_PRICING_ERROR=${approvalPricingError || "NONE"}`);
console.log(`REQUIRED_OPERATIONS=${JSON.stringify(requiredOperations)}`);
console.log(`MISSING_APPROVED_OPERATIONS=${JSON.stringify(missingApprovedOperations)}`);
console.log(`PROJECT_GRAPH_COUNT=${graphs.length}`);
console.log(`PROJECT_TASK_COUNT=${tasks.length}`);
console.log(`OLD_EXECUTION_CONTEXT_MATCH_COUNT=${contextMatches.length}`);
console.log(`OLD_EXECUTION_CONTEXT_MATCHES=${JSON.stringify(contextMatches.slice(0, 100))}`);
console.log(`DIRECTION_ONLY_STALE_AUDIO_GATE=${staleAudioGate ? "YES" : "NO"}`);
console.log(`TEMPORAL_SOURCE_AUDIO_HARDCODED=${hardcodedSourceAudio ? "YES" : "NO"}`);
console.log(`NON_MUSIC_SYNTHESIS_PROVIDER_CALL=${unconditionalSynthesis ? "YES" : "NO"}`);
console.log(`LEGACY_DIRECTION_RECOVERY_ENABLED=${legacyRecoveryEnabled ? "YES" : "NO"}`);
console.log(`FRESH_DIRECTION_RECOVERY_DISABLE_INSTALLED=${explicitFreshRecoveryDisable ? "YES" : "NO"}`);
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("WALLET_CHANGED=NO");
console.log("USAGE_ROWS_CREATED=NO");
console.log("BILLING_ROWS_CREATED=NO");
console.log("PROJECT_ROWS_CHANGED=NO");
console.log("GRAPH_CREATED=NO");
console.log("TASKS_CREATED=NO");
console.log("BUDGET_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("============================================================");
console.log("PREFLIGHT RESULT");
console.log("============================================================");
console.log(`FRESH_DIRECTION_EXECUTION_READY=${blockers.length ? "NO" : "YES"}`);
console.log(`FRESH_DIRECTION_EXECUTION_BLOCKER_COUNT=${blockers.length}`);
console.log(`FRESH_DIRECTION_EXECUTION_BLOCKERS=${JSON.stringify(blockers)}`);

if (blockers.length) process.exitCode = 2;
