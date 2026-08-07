#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });

const CONTRACT = "CREATIVE_VERSIONED_DIRECTION_APPROVAL_ENVELOPE_V3";
const PREFLIGHT_CONTRACT =
  "CREATIVE_VERSIONED_STORY_LINEAGE_RECONCILIATION_PREFLIGHT_V1";
const RECONCILIATION_CONTRACT =
  "CREATIVE_STORY_LINEAGE_HISTORICAL_RECONCILIATION_PLAN_V1";
const CAPABILITY = "ai.reasoning.execute";

const SOURCE_FILES = [
  "lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js",
  "lib/creative/director/runtime/CreativeUniversalTemporalDirectionRuntime.js",
  "lib/creative/director/runtime/CreativeConceptCouncilRuntime.js",
  "lib/creative/director/runtime/CreativeBusinessActionIntelligenceRuntime.js",
  "lib/creative/director/runtime/CreativeBusinessActionAssignmentRuntime.js",
  "lib/creative/director/runtime/CreativeCommercialNarrativeRuntime.js",
  "lib/creative/director/runtime/CreativeBusinessActionCoverageRuntime.js",
  "lib/creative/director/runtime/CreativeCommercialNarrativeCinematicBridgeRuntime.js",
  "lib/creative/director/runtime/CreativeCinematicImpactRuntime.js",
  "lib/creative/director/runtime/CreativeDirectionCostApprovalRuntime.js",
  "lib/creative/director/runtime/CreativeMeasuredUniversalTemporalDirectionRuntime.js",
  "lib/creative/director/runtime/CreativeUniversalTemporalCoverageBootstrap.js",
  "lib/creative/production-graph/runtime/CreativeBusinessActionProductionGraphRuntime.js",
];

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(6)) : null;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(canonical(value)))
    .digest("hex");
}

function readJson(filePath, label) {
  const absolute = path.resolve(text(filePath));
  if (!absolute || !fs.existsSync(absolute)) {
    throw new Error(`${label}_NOT_FOUND:${absolute || "MISSING"}`);
  }
  const raw = fs.readFileSync(absolute, "utf8");
  return { absolute, sha256: sha256(raw), value: JSON.parse(raw) };
}

function writeJson(filePath, value) {
  const absolute = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return absolute;
}

function newest(rows = []) {
  return [...list(rows)].sort((left, right) => {
    const a = Date.parse(left.updated_at || left.created_at || 0) || 0;
    const b = Date.parse(right.updated_at || right.created_at || 0) || 0;
    return b - a;
  })[0] || null;
}

function sourceEvidence() {
  return SOURCE_FILES.map((file) => {
    const absolute = path.resolve(file);
    if (!fs.existsSync(absolute)) {
      throw new Error(`DIRECTION_WORKLOAD_SOURCE_MISSING:${file}`);
    }
    const source = fs.readFileSync(absolute, "utf8");
    return { file, sha256: sha256(source), source };
  });
}

function assertMarkers(sources = []) {
  const joined = sources.map((item) => item.source).join("\n");
  const markers = [
    "TEMPORAL_MASTER_PLAN_BASE_V1",
    "TEMPORAL_SCENE_ARCHITECTURE_V1",
    "TEMPORAL_SCENE_SHOT_DIRECTION_V1",
    "CREATIVE_CONCEPT_DIRECTOR_",
    "CREATIVE_CONCEPT_CRITIC_",
    "CREATIVE_EXECUTIVE_CONCEPT_SELECTION_V1",
    "CREATIVE_SELECTED_CONCEPT_PLAN_REVISION_V1",
    "CREATIVE_BUSINESS_ACTION_INTELLIGENCE_V2",
    "CREATIVE_BUSINESS_ACTION_ASSIGNMENT_V1",
    "CREATIVE_COMMERCIAL_NARRATIVE_SYNTHESIS_V1",
    "CREATIVE_COMMERCIAL_NARRATIVE_AUTHORITY_V1",
    "CREATIVE_COMMERCIAL_NARRATIVE_CINEMATIC_BRIDGE_V1",
    "CREATIVE_CINEMATIC_AUDIENCE_UNDERSTANDING_V1",
    "CREATIVE_CINEMATIC_IMPACT_DESIGN_V2",
    "CREATIVE_CINEMATIC_IMPACT_CRITIQUE_V1",
    "CREATIVE_CINEMATIC_IMPACT_REPAIR_V1",
    "CREATIVE_BUSINESS_ACTION_PRODUCTION_GRAPH_V2",
    "CREATIVE_IDENTITY_ATLAS_MATERIALIZATION_AUTHORIZED",
    "CREATIVE_DIRECTION_BUDGET_APPROVAL_V2",
  ];
  const missing = markers.filter((marker) => !joined.includes(marker));
  if (missing.length) {
    throw new Error(
      `DIRECTION_WORKLOAD_SOURCE_MARKERS_MISSING:${missing.join(",")}`,
    );
  }
  return markers;
}

function temporalDuration(project = {}, brief = {}) {
  const value = finite(
    project.metadata?.temporal_contract?.duration_seconds ??
    project.metadata?.temporalContract?.duration_seconds ??
    project.metadata?.full_master_duration ??
    project.metadata?.full_song_duration_seconds ??
    project.metadata?.creative_direction_constraints?.full_song_duration_seconds ??
    brief.duration_seconds ??
    brief.target_duration ??
    project.target_duration,
  );
  if (!value || value <= 0) {
    throw new Error("CREATIVE_FULL_TEMPORAL_DURATION_REQUIRED");
  }
  return value;
}

function sceneCountRange(duration) {
  const preferred = Math.max(6, Math.min(20, Math.round(duration / 14)));
  return {
    minimum: Math.max(5, preferred - 2),
    preferred,
    maximum: Math.min(24, preferred + 3),
  };
}

function operationDefinitions(sceneCount) {
  return [
    { operation: "TEMPORAL_MASTER_PLAN_BASE_V1", count: 1, max_output_tokens: 16000, stage: "BASE_PLAN" },
    { operation: "TEMPORAL_SCENE_ARCHITECTURE_V1", count: 1, max_output_tokens: 14000, stage: "SCENE_ARCHITECTURE" },
    { operation: "TEMPORAL_SCENE_SHOT_DIRECTION_V1", count: sceneCount, max_output_tokens: 15000, stage: "SHOT_DIRECTION_PER_SCENE" },
    { operation: "CREATIVE_CONCEPT_DIRECTOR_CONCEPT-A_V1", count: 1, max_output_tokens: 8000, stage: "CONCEPT_DIRECTOR" },
    { operation: "CREATIVE_CONCEPT_DIRECTOR_CONCEPT-B_V1", count: 1, max_output_tokens: 8000, stage: "CONCEPT_DIRECTOR" },
    { operation: "CREATIVE_CONCEPT_DIRECTOR_CONCEPT-C_V1", count: 1, max_output_tokens: 8000, stage: "CONCEPT_DIRECTOR" },
    { operation: "CREATIVE_CONCEPT_CRITIC_ORIGINALITY_V1", count: 1, max_output_tokens: 7000, stage: "CONCEPT_CRITIC" },
    { operation: "CREATIVE_CONCEPT_CRITIC_MUSIC_ENERGY_V1", count: 1, max_output_tokens: 7000, stage: "CONCEPT_CRITIC" },
    { operation: "CREATIVE_CONCEPT_CRITIC_BRAND_COMMERCIAL_V1", count: 1, max_output_tokens: 7000, stage: "CONCEPT_CRITIC" },
    { operation: "CREATIVE_CONCEPT_CRITIC_PRODUCTION_V1", count: 1, max_output_tokens: 7000, stage: "CONCEPT_CRITIC" },
    { operation: "CREATIVE_EXECUTIVE_CONCEPT_SELECTION_V1", count: 1, max_output_tokens: 5000, stage: "EXECUTIVE_SELECTION" },
    { operation: "CREATIVE_SELECTED_CONCEPT_PLAN_REVISION_V1", count: 1, max_output_tokens: 16000, stage: "SELECTED_CONCEPT_REVISION" },
    { operation: "CREATIVE_BUSINESS_ACTION_INTELLIGENCE_V2", count: 1, max_output_tokens: 18000, stage: "BUSINESS_ACTION_INTELLIGENCE" },
    { operation: "CREATIVE_BUSINESS_ACTION_ASSIGNMENT_V1", count: 1, max_output_tokens: 18000, stage: "BUSINESS_ACTION_ASSIGNMENT" },
    { operation: "CREATIVE_COMMERCIAL_NARRATIVE_SYNTHESIS_V1", count: 1, max_output_tokens: 18000, stage: "COMMERCIAL_NARRATIVE_SYNTHESIS" },
    { operation: "CREATIVE_CINEMATIC_AUDIENCE_UNDERSTANDING_V1", count: 1, max_output_tokens: 12000, stage: "CINEMATIC_AUDIENCE_UNDERSTANDING" },
    { operation: "CREATIVE_CINEMATIC_IMPACT_DESIGN_V2", count: 1, max_output_tokens: 18000, stage: "CINEMATIC_DESIGN" },
    { operation: "CREATIVE_CINEMATIC_IMPACT_CRITIQUE_V1", count: 3, max_output_tokens: 9000, stage: "CINEMATIC_CRITIQUE_MAX" },
    { operation: "CREATIVE_CINEMATIC_IMPACT_REPAIR_V1", count: 2, max_output_tokens: 18000, stage: "CINEMATIC_REPAIR_MAX" },
  ];
}

function workload(sceneCount) {
  const operations = operationDefinitions(sceneCount);
  return {
    scene_count: sceneCount,
    call_count: operations.reduce((sum, item) => sum + item.count, 0),
    operations,
  };
}

async function priceCandidate({ row, operations, PricingRuntime, currency }) {
  const tokenPriced =
    Number(row.input_cost_per_1m || 0) > 0 ||
    Number(row.output_cost_per_1m || 0) > 0;
  const estimatedInputTokens = finite(
    row.metadata?.estimated_input_tokens_per_request,
  );
  const blockers = [];
  if (tokenPriced && (!estimatedInputTokens || estimatedInputTokens <= 0)) {
    blockers.push("CONFIGURED_INPUT_TOKEN_ESTIMATE_REQUIRED");
  }

  const priced = [];
  if (!blockers.length) {
    for (const operation of operations) {
      const pricing = await PricingRuntime.resolveById({
        pricing_id: row.id,
        currency,
        usage: tokenPriced
          ? {
              quantity: 1,
              input_tokens: estimatedInputTokens,
              output_tokens: operation.max_output_tokens,
              estimated: true,
            }
          : { quantity: 1 },
      });
      priced.push({
        ...operation,
        estimated_input_tokens: tokenPriced ? estimatedInputTokens : null,
        estimated_customer_price_per_call: pricing.customer_price,
        estimated_stage_ceiling: money(
          Number(pricing.customer_price) * Number(operation.count),
        ),
      });
    }
  }

  const maximum = blockers.length
    ? null
    : money(
        priced.reduce(
          (sum, item) => sum + Number(item.estimated_stage_ceiling || 0),
          0,
        ),
      );
  const perCall = blockers.length
    ? null
    : money(
        Math.max(
          ...priced.map((item) =>
            Number(item.estimated_customer_price_per_call || 0)),
          0,
        ),
      );
  const core = {
    pricing_id: row.id,
    provider: row.provider || null,
    model: row.model || null,
    capability: row.capability || null,
    currency: row.currency || currency,
    maximum_calls: operations.reduce((sum, item) => sum + item.count, 0),
    maximum_per_call_customer_price: perCall,
    maximum_customer_price: maximum,
    operations: priced,
    blockers,
  };
  return { ...core, candidate_hash: sha256(core) };
}

const reconciliationFile = readJson(
  process.argv[2],
  "HISTORICAL_RECONCILIATION_PLAN",
);
const preflightFile = readJson(
  process.argv[3],
  "VERSIONED_RECONCILIATION_PREFLIGHT",
);
const reconciliation = object(reconciliationFile.value);
const preflight = object(preflightFile.value);

if (text(reconciliation.contract) !== RECONCILIATION_CONTRACT) {
  throw new Error("DIRECTION_ENVELOPE_RECONCILIATION_CONTRACT_INVALID");
}
if (text(preflight.contract) !== PREFLIGHT_CONTRACT) {
  throw new Error("DIRECTION_ENVELOPE_PREFLIGHT_CONTRACT_INVALID");
}
if (preflight.authority_ready !== true) {
  throw new Error("DIRECTION_ENVELOPE_AUTHORITY_NOT_READY");
}
if (
  text(preflight.reconciliation_plan_hash) !==
  text(reconciliation.plan_hash)
) {
  throw new Error("DIRECTION_ENVELOPE_PLAN_PREFLIGHT_HASH_MISMATCH");
}

const organizationId = text(reconciliation.organization_id);
const projectId = text(reconciliation.creative_project_id);
if (!organizationId || !projectId) {
  throw new Error("DIRECTION_ENVELOPE_SCOPE_REQUIRED");
}

const [
  { CreativeProjectRuntime },
  { CreativeBriefRuntime },
  { supabaseAdmin },
  { listCapabilityPricing },
  { PricingRuntime },
] = await Promise.all([
  import("@/lib/creative/projects/runtime/CreativeProjectRuntime"),
  import("@/lib/creative/brief/runtime/CreativeBriefRuntime"),
  import("@/lib/shared/supabase/admin"),
  import("@/lib/platform/service-runtime/pricing/repositories/ProviderPricingRepository"),
  import("@/lib/platform/service-runtime/pricing/PricingRuntime"),
]);

const project = await CreativeProjectRuntime.get(projectId);
if (!project || text(project.organization_id) !== organizationId) {
  throw new Error("DIRECTION_ENVELOPE_PROJECT_NOT_FOUND");
}
const briefs = await CreativeBriefRuntime.list({
  organization_id: organizationId,
  creative_project_id: projectId,
});
const brief = newest(briefs) || {};
const walletResult = await supabaseAdmin
  .from("organization_wallets")
  .select("available_balance,reserved_balance,currency,updated_at")
  .eq("organization_id", organizationId)
  .single();
if (walletResult.error) throw walletResult.error;
const currency = text(walletResult.data?.currency).toUpperCase();
if (!currency) {
  throw new Error("DIRECTION_ENVELOPE_WALLET_CURRENCY_REQUIRED");
}

const duration = temporalDuration(project, brief);
const range = sceneCountRange(duration);
const workloads = {
  minimum: workload(range.minimum),
  preferred: workload(range.preferred),
  maximum: workload(range.maximum),
};
const sources = sourceEvidence();
const markers = assertMarkers(sources);
const pricingRows = await listCapabilityPricing({
  capability: CAPABILITY,
  currency,
});
const uniqueRows = [
  ...new Map(list(pricingRows).map((row) => [row.id, row])).values(),
];
const candidates = [];
for (const row of uniqueRows) {
  candidates.push(
    await priceCandidate({
      row,
      operations: workloads.maximum.operations,
      PricingRuntime,
      currency,
    }),
  );
}
const ready = candidates.filter(
  (item) =>
    !item.blockers.length &&
    Number(item.maximum_customer_price) > 0,
);

const core = {
  organization_id: organizationId,
  creative_project_id: projectId,
  reconciliation_plan_hash: reconciliation.plan_hash,
  research_identity:
    preflight.current_research_authority?.research_identity || null,
  command_identity: project.metadata?.command_identity || null,
  workflow: {
    kind: "TEMPORAL",
    duration_seconds: duration,
    scene_count_range: range,
    planning_only: true,
    business_action_intelligence_required: true,
    business_action_assignment_required: true,
    commercial_narrative_required: true,
    commercial_narrative_cinematic_bridge_required: true,
    communication_strategy_required: true,
    dynamic_sound_strategy_required: true,
    autonomous_cinematic_repair_required: true,
    maximum_cinematic_repair_rounds: 2,
    identity_atlas_materialization_authorized: false,
    media_generation_authorized: false,
  },
  workload: workloads,
  exact_allowed_operations: workloads.maximum.operations.map(
    (item) => item.operation,
  ),
  maximum_calls: workloads.maximum.call_count,
  runtime_source_evidence: sources.map(({ file, sha256: hash }) => ({
    file,
    sha256: hash,
  })),
  runtime_source_markers: markers,
  pricing: {
    capability: CAPABILITY,
    wallet_currency: currency,
    candidate_count: candidates.length,
    approval_ready_candidate_count: ready.length,
    candidates,
    provider_selected: false,
    pricing_selected: false,
  },
  wallet: {
    available_balance: money(walletResult.data?.available_balance),
    reserved_balance: money(walletResult.data?.reserved_balance),
    currency,
    updated_at: walletResult.data?.updated_at || null,
  },
  authorization: {
    direction_budget_approval_created: false,
    direction_execution_authorized: false,
    provider_selected: false,
    provider_spend_authorized: false,
    identity_atlas_materialization_authorized: false,
    database_reconciliation_authorized: false,
    task_dispatch_authorized: false,
    media_generation_authorized: false,
    finalisation_authorized: false,
    publication_authorized: false,
  },
};

const blockers = [
  ...(ready.length ? [] : ["NO_APPROVAL_READY_REASONING_PRICING_CANDIDATE"]),
  ...(!core.command_identity ? ["PROJECT_COMMAND_IDENTITY_REQUIRED"] : []),
];
const report = {
  contract: CONTRACT,
  generated_at: new Date().toISOString(),
  envelope_hash: sha256(core),
  ...core,
  blockers,
  decision: blockers.length
    ? "DIRECTION_APPROVAL_ENVELOPE_NOT_READY"
    : "DIRECTION_APPROVAL_ENVELOPE_READY_FOR_EXPLICIT_CANDIDATE_SELECTION",
  database_writes_executed: false,
  storage_writes_executed: false,
  provider_selection_executed: false,
  provider_spend_approved: false,
  provider_calls_executed: false,
  identity_atlas_materialization_executed: false,
  task_dispatch_executed: false,
  source_regeneration_executed: false,
  finalisation_executed: false,
  publication_executed: false,
};

const outputPath = writeJson(
  process.env.CREATIVE_VERSIONED_DIRECTION_APPROVAL_ENVELOPE_V3_OUTPUT ||
    "/tmp/creative-versioned-direction-approval-envelope-v3.json",
  report,
);

console.log("============================================================");
console.log("READ-ONLY CREATIVE VERSIONED DIRECTION APPROVAL ENVELOPE V3");
console.log("============================================================");
console.log(`CONTRACT=${report.contract}`);
console.log(`OUTPUT=${outputPath}`);
console.log(`ENVELOPE_HASH=${report.envelope_hash}`);
console.log(`DURATION_SECONDS=${report.workflow.duration_seconds}`);
console.log(`SCENE_COUNT_MIN=${report.workflow.scene_count_range.minimum}`);
console.log(`SCENE_COUNT_PREFERRED=${report.workflow.scene_count_range.preferred}`);
console.log(`SCENE_COUNT_MAX=${report.workflow.scene_count_range.maximum}`);
console.log(`CALL_COUNT_MIN=${report.workload.minimum.call_count}`);
console.log(`CALL_COUNT_PREFERRED=${report.workload.preferred.call_count}`);
console.log(`CALL_COUNT_MAX=${report.workload.maximum.call_count}`);
console.log(`ALLOWED_OPERATIONS=${JSON.stringify(report.exact_allowed_operations)}`);
console.log(`WALLET_CURRENCY=${report.wallet.currency}`);
console.log(`WALLET_AVAILABLE_BALANCE=${report.wallet.available_balance}`);
console.log(`PRICING_CANDIDATE_COUNT=${report.pricing.candidate_count}`);
console.log(`APPROVAL_READY_PRICING_CANDIDATE_COUNT=${report.pricing.approval_ready_candidate_count}`);
for (const candidate of report.pricing.candidates) {
  console.log([
    "PRICING_CANDIDATE",
    `hash=${candidate.candidate_hash}`,
    `pricing_id=${candidate.pricing_id}`,
    `provider=${candidate.provider || ""}`,
    `model=${candidate.model || ""}`,
    `currency=${candidate.currency || ""}`,
    `max_calls=${candidate.maximum_calls}`,
    `max_per_call=${candidate.maximum_per_call_customer_price ?? ""}`,
    `max_total=${candidate.maximum_customer_price ?? ""}`,
    `blockers=${candidate.blockers.join(",")}`,
  ].join("|"));
}
console.log(`BLOCKERS=${JSON.stringify(report.blockers)}`);
console.log(`DECISION=${report.decision}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("STORAGE_WRITES_EXECUTED=NO");
console.log("PROVIDER_SELECTION_EXECUTED=NO");
console.log("PROVIDER_SPEND_APPROVED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("IDENTITY_ATLAS_MATERIALIZATION_EXECUTED=NO");
console.log("TASK_DISPATCH_EXECUTED=NO");
console.log("SOURCE_REGENERATION_EXECUTED=NO");
console.log("FINALISATION_EXECUTED=NO");
console.log("PUBLICATION_EXECUTED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

if (report.blockers.length) process.exitCode = 2;
