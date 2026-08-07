#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });

const CONTRACT = "CREATIVE_VERSIONED_DIRECTION_APPROVAL_ENVELOPE_V1";
const PREFLIGHT_CONTRACT =
  "CREATIVE_VERSIONED_STORY_LINEAGE_RECONCILIATION_PREFLIGHT_V1";
const RECONCILIATION_CONTRACT =
  "CREATIVE_STORY_LINEAGE_HISTORICAL_RECONCILIATION_PLAN_V1";
const DIRECTION_APPROVAL_CONTRACT = "CREATIVE_DIRECTION_BUDGET_APPROVAL_V2";
const CAPABILITY = "ai.reasoning.execute";

const SOURCE_FILES = [
  "lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js",
  "lib/creative/director/runtime/CreativeUniversalTemporalDirectionRuntime.js",
  "lib/creative/director/runtime/CreativeConceptCouncilRuntime.js",
  "lib/creative/director/runtime/CreativeDirectionCostApprovalRuntime.js",
  "lib/creative/director/runtime/CreativeMeasuredUniversalTemporalDirectionRuntime.js",
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

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => [key, stable(value[key])]),
  );
}

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(stable(value)))
    .digest("hex");
}

function readJson(filePath, label) {
  const absolute = path.resolve(text(filePath));
  if (!absolute || !fs.existsSync(absolute)) {
    throw new Error(`${label}_NOT_FOUND:${absolute || "MISSING"}`);
  }
  const raw = fs.readFileSync(absolute, "utf8");
  return {
    absolute,
    sha256: sha256(raw),
    value: JSON.parse(raw),
  };
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
    return {
      file,
      sha256: sha256(source),
      source,
    };
  });
}

function assertCurrentWorkloadSource(sources = []) {
  const joined = sources.map((entry) => entry.source).join("\n");
  const requiredMarkers = [
    "TEMPORAL_MASTER_PLAN_BASE_V1",
    "TEMPORAL_SCENE_ARCHITECTURE_V1",
    "TEMPORAL_SCENE_SHOT_DIRECTION_V1",
    "UNIVERSAL_MUSIC_WORLD_IDENTITY_SYNTHESIS_V1",
    "CREATIVE_CONCEPT_DIRECTOR_",
    "CREATIVE_CONCEPT_CRITIC_",
    "CREATIVE_EXECUTIVE_CONCEPT_SELECTION_V1",
    "CREATIVE_SELECTED_CONCEPT_PLAN_REVISION_V1",
    "CREATIVE_IDENTITY_ATLAS_MATERIALIZATION_AUTHORIZED",
    "CREATIVE_DIRECTION_BUDGET_APPROVAL_V2",
  ];
  const missing = requiredMarkers.filter((marker) => !joined.includes(marker));
  if (missing.length) {
    throw new Error(`DIRECTION_WORKLOAD_SOURCE_MARKERS_MISSING:${missing.join(",")}`);
  }
  return requiredMarkers;
}

function temporalDuration(project = {}, brief = {}) {
  const metadata = object(project.metadata);
  const value = finite(
    metadata.temporal_contract?.duration_seconds ??
    metadata.temporalContract?.duration_seconds ??
    metadata.full_master_duration ??
    metadata.full_song_duration_seconds ??
    metadata.creative_direction_constraints?.full_song_duration_seconds ??
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

function assetKind(asset = {}) {
  const mime = text(
    asset.mime_type ||
    asset.technical?.mime_type ||
    asset.metadata?.mime_type ||
    asset.analysis?.technical?.mime_type,
  ).toLowerCase();
  const type = text(asset.asset_type || asset.type).toLowerCase();
  const source = text(asset.url || asset.file_url || asset.image_url).toLowerCase();
  if (mime.startsWith("audio/") || /audio|music/.test(type) || /\.(mp3|wav|m4a|aac|flac|ogg)(\?|$)/.test(source)) {
    return "AUDIO";
  }
  return "OTHER";
}

function assetId(asset = {}) {
  return text(asset.id || asset.asset_id);
}

function assetEvidenceText(asset = {}) {
  return [
    asset.name,
    asset.title,
    asset.file_name,
    asset.description,
    asset.analysis?.description,
    asset.analysis?.summary,
    ...list(asset.tags),
    ...list(asset.analysis?.tags),
  ].map(text).filter(Boolean).join(" ").toLowerCase();
}

function primaryAudio(assets = [], project = {}, brief = {}) {
  const explicitId = text(
    brief.primary_audio_asset_id ||
    brief.metadata?.primary_audio_asset_id ||
    project.metadata?.primary_audio_asset_id ||
    project.metadata?.soundtrack_asset_id,
  );
  return list(assets)
    .filter((asset) => assetKind(asset) === "AUDIO")
    .map((asset) => {
      const duration = finite(
        asset.technical?.duration_seconds ||
        asset.analysis?.duration_seconds ||
        asset.analysis?.technical?.duration_seconds ||
        asset.metadata?.duration_seconds,
      ) || 0;
      const source = assetEvidenceText(asset);
      let score = duration;
      if (/\b(master|song|music|track|single|soundtrack|vocal|mix)\b/.test(source)) score += 10000;
      if (/\b(sfx|sound effect|room tone|ambient|ambience)\b/.test(source)) score -= 5000;
      if (assetId(asset) === explicitId) score += 100000;
      return { asset, score };
    })
    .sort((left, right) => right.score - left.score)[0]?.asset || null;
}

function musicVideoProject(project = {}, brief = {}, audio = null) {
  const corpus = JSON.stringify({ project, brief }).toLowerCase();
  return Boolean(
    audio && (
      project.metadata?.music_video === true ||
      project.metadata?.full_song === true ||
      /music video|full song|artist video|performance video/.test(corpus)
    )
  );
}

function operationDefinitions({ musicVideo, sceneCount }) {
  const operations = [];
  if (musicVideo) {
    operations.push({
      operation: "UNIVERSAL_MUSIC_WORLD_IDENTITY_SYNTHESIS_V1",
      count: 1,
      max_output_tokens: 12000,
      stage: "UNIVERSAL_SYNTHESIS",
    });
  }
  operations.push(
    {
      operation: "TEMPORAL_MASTER_PLAN_BASE_V1",
      count: 1,
      max_output_tokens: 16000,
      stage: "BASE_PLAN",
    },
    {
      operation: "TEMPORAL_SCENE_ARCHITECTURE_V1",
      count: 1,
      max_output_tokens: 14000,
      stage: "SCENE_ARCHITECTURE",
    },
    {
      operation: "TEMPORAL_SCENE_SHOT_DIRECTION_V1",
      count: sceneCount,
      max_output_tokens: 15000,
      stage: "SHOT_DIRECTION_PER_SCENE",
    },
    {
      operation: "CREATIVE_CONCEPT_DIRECTOR_CONCEPT-A_V1",
      count: 1,
      max_output_tokens: 8000,
      stage: "INDEPENDENT_CONCEPT_DIRECTOR",
    },
    {
      operation: "CREATIVE_CONCEPT_DIRECTOR_CONCEPT-B_V1",
      count: 1,
      max_output_tokens: 8000,
      stage: "INDEPENDENT_CONCEPT_DIRECTOR",
    },
    {
      operation: "CREATIVE_CONCEPT_DIRECTOR_CONCEPT-C_V1",
      count: 1,
      max_output_tokens: 8000,
      stage: "INDEPENDENT_CONCEPT_DIRECTOR",
    },
    {
      operation: "CREATIVE_CONCEPT_CRITIC_ORIGINALITY_V1",
      count: 1,
      max_output_tokens: 7000,
      stage: "INDEPENDENT_CONCEPT_CRITIC",
    },
    {
      operation: "CREATIVE_CONCEPT_CRITIC_MUSIC_ENERGY_V1",
      count: 1,
      max_output_tokens: 7000,
      stage: "INDEPENDENT_CONCEPT_CRITIC",
    },
    {
      operation: "CREATIVE_CONCEPT_CRITIC_BRAND_COMMERCIAL_V1",
      count: 1,
      max_output_tokens: 7000,
      stage: "INDEPENDENT_CONCEPT_CRITIC",
    },
    {
      operation: "CREATIVE_CONCEPT_CRITIC_PRODUCTION_V1",
      count: 1,
      max_output_tokens: 7000,
      stage: "INDEPENDENT_CONCEPT_CRITIC",
    },
    {
      operation: "CREATIVE_EXECUTIVE_CONCEPT_SELECTION_V1",
      count: 1,
      max_output_tokens: 5000,
      stage: "EXECUTIVE_SELECTION",
    },
    {
      operation: "CREATIVE_SELECTED_CONCEPT_PLAN_REVISION_V1",
      count: 1,
      max_output_tokens: 16000,
      stage: "SELECTED_CONCEPT_REVISION",
    },
  );
  return operations;
}

function workloadSummary({ musicVideo, range }) {
  const forSceneCount = (sceneCount) => {
    const operations = operationDefinitions({ musicVideo, sceneCount });
    return {
      scene_count: sceneCount,
      call_count: operations.reduce((sum, item) => sum + item.count, 0),
      operations,
    };
  };
  return {
    minimum: forSceneCount(range.minimum),
    preferred: forSceneCount(range.preferred),
    maximum: forSceneCount(range.maximum),
  };
}

async function priceCandidate({
  row,
  operations,
  PricingRuntime,
  walletCurrency,
}) {
  const tokenPriced = Number(row.input_cost_per_1m || 0) > 0 ||
    Number(row.output_cost_per_1m || 0) > 0;
  const estimatedInputTokens = finite(
    row.metadata?.estimated_input_tokens_per_request,
  );
  const blockers = [];
  if (tokenPriced && (!estimatedInputTokens || estimatedInputTokens <= 0)) {
    blockers.push("CONFIGURED_INPUT_TOKEN_ESTIMATE_REQUIRED");
  }

  const pricedOperations = [];
  if (!blockers.length) {
    for (const operation of operations) {
      const pricing = await PricingRuntime.resolveById({
        pricing_id: row.id,
        currency: walletCurrency,
        usage: tokenPriced
          ? {
              quantity: 1,
              input_tokens: estimatedInputTokens,
              output_tokens: operation.max_output_tokens,
              estimated: true,
            }
          : { quantity: 1 },
      });
      pricedOperations.push({
        ...operation,
        estimated_input_tokens: tokenPriced ? estimatedInputTokens : null,
        estimated_customer_price_per_call: pricing.customer_price,
        estimated_stage_ceiling: money(
          Number(pricing.customer_price) * Number(operation.count),
        ),
      });
    }
  }

  const total = blockers.length
    ? null
    : money(pricedOperations.reduce(
        (sum, item) => sum + Number(item.estimated_stage_ceiling || 0),
        0,
      ));
  const maximumPerCall = blockers.length
    ? null
    : money(Math.max(
        ...pricedOperations.map((item) =>
          Number(item.estimated_customer_price_per_call || 0)),
        0,
      ));

  const core = {
    pricing_id: row.id,
    provider: row.provider || null,
    model: row.model || null,
    capability: row.capability || null,
    currency: row.currency || walletCurrency,
    unit: row.unit || null,
    platform_markup_percent: Number(row.markup_percent || 0),
    estimate_basis: tokenPriced
      ? "CONFIGURED_INPUT_TOKEN_ESTIMATE_PLUS_OPERATION_MAX_OUTPUT_TOKENS"
      : "CONFIGURED_UNIT_PRICE_PER_REASONING_CALL",
    configured_estimated_input_tokens_per_request:
      tokenPriced ? estimatedInputTokens : null,
    maximum_calls: operations.reduce((sum, item) => sum + item.count, 0),
    maximum_per_call_customer_price: maximumPerCall,
    maximum_customer_price: total,
    operations: pricedOperations,
    blockers,
  };
  return {
    ...core,
    candidate_hash: sha256(core),
  };
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
if (text(preflight.reconciliation_plan_hash) !== text(reconciliation.plan_hash)) {
  throw new Error("DIRECTION_ENVELOPE_PLAN_PREFLIGHT_HASH_MISMATCH");
}
if (text(reconciliation.decision) !== "HISTORICAL_RECONCILIATION_PLAN_READY") {
  throw new Error("DIRECTION_ENVELOPE_RECONCILIATION_NOT_READY");
}

const organizationId = text(reconciliation.organization_id);
const projectId = text(reconciliation.creative_project_id);
if (!organizationId || !projectId) {
  throw new Error("DIRECTION_ENVELOPE_SCOPE_REQUIRED");
}

const [
  { CreativeProjectRuntime },
  { CreativeBriefRuntime },
  { CreativeAssetsRuntime },
  { supabaseAdmin },
  { listCapabilityPricing },
  { PricingRuntime },
] = await Promise.all([
  import("@/lib/creative/projects/runtime/CreativeProjectRuntime"),
  import("@/lib/creative/brief/runtime/CreativeBriefRuntime"),
  import("@/lib/creative/assets/runtime/CreativeAssetsRuntime"),
  import("@/lib/shared/supabase/admin"),
  import("@/lib/platform/service-runtime/pricing/repositories/ProviderPricingRepository"),
  import("@/lib/platform/service-runtime/pricing/PricingRuntime"),
]);

const project = await CreativeProjectRuntime.get(projectId);
if (!project || text(project.organization_id) !== organizationId) {
  throw new Error("DIRECTION_ENVELOPE_PROJECT_NOT_FOUND");
}
const missionId = text(
  project.creative_mission_id ||
  project.metadata?.creative_mission_id,
);
const query = {
  organization_id: organizationId,
  creative_project_id: projectId,
  creative_mission_id: missionId || undefined,
};
const [briefs, assets, walletResult] = await Promise.all([
  CreativeBriefRuntime.list(query),
  CreativeAssetsRuntime.list(query),
  supabaseAdmin
    .from("organization_wallets")
    .select("available_balance,reserved_balance,currency,updated_at")
    .eq("organization_id", organizationId)
    .single(),
]);
if (walletResult.error) throw walletResult.error;
const brief = newest(briefs) || {};
const assetRows = list(assets);
const walletCurrency = text(walletResult.data?.currency).toUpperCase();
if (!walletCurrency) {
  throw new Error("DIRECTION_ENVELOPE_WALLET_CURRENCY_REQUIRED");
}

const duration = temporalDuration(project, brief);
const range = sceneCountRange(duration);
const audio = primaryAudio(assetRows, project, brief);
const isMusicVideo = musicVideoProject(project, brief, audio);
const workload = workloadSummary({ musicVideo: isMusicVideo, range });
const sources = sourceEvidence();
const sourceMarkers = assertCurrentWorkloadSource(sources);
const pricingRows = await listCapabilityPricing({
  capability: CAPABILITY,
  currency: walletCurrency,
});
const uniquePricingRows = [
  ...new Map(list(pricingRows).map((row) => [row.id, row])).values(),
];
const candidates = [];
for (const row of uniquePricingRows) {
  candidates.push(await priceCandidate({
    row,
    operations: workload.maximum.operations,
    PricingRuntime,
    walletCurrency,
  }));
}

const approvalReadyCandidates = candidates.filter((candidate) =>
  candidate.blockers.length === 0 &&
  Number(candidate.maximum_customer_price) > 0 &&
  Number(candidate.maximum_per_call_customer_price) > 0,
);
const currentApproval = object(project.metadata?.paid_direction_approval);
const currentApprovalStatus = text(currentApproval.status).toUpperCase();
const currentApprovalExhausted =
  Number(currentApproval.call_count || 0) >= Number(currentApproval.maximum_calls || 0) &&
  Number(currentApproval.maximum_calls || 0) > 0;

const envelopeCore = {
  organization_id: organizationId,
  creative_project_id: projectId,
  reconciliation_plan_hash: reconciliation.plan_hash,
  research_identity:
    preflight.current_research_authority?.research_identity || null,
  research_report_id:
    preflight.current_research_authority?.research_report_id || null,
  command_identity: project.metadata?.command_identity || null,
  workflow: {
    kind: "TEMPORAL",
    duration_seconds: duration,
    scene_count_range: range,
    primary_audio_asset_id: audio ? assetId(audio) : null,
    music_video: isMusicVideo,
    identity_atlas_materialization_authorized: false,
    media_generation_authorized: false,
  },
  workload,
  exact_allowed_operations: workload.maximum.operations.map((item) => item.operation),
  maximum_calls: workload.maximum.call_count,
  runtime_source_evidence: sources.map(({ file, sha256: hash }) => ({
    file,
    sha256: hash,
  })),
  runtime_source_markers: sourceMarkers,
  pricing: {
    capability: CAPABILITY,
    wallet_currency: walletCurrency,
    candidate_count: candidates.length,
    approval_ready_candidate_count: approvalReadyCandidates.length,
    candidates,
    provider_selected: false,
    pricing_selected: false,
  },
  wallet: {
    available_balance: money(walletResult.data?.available_balance),
    reserved_balance: money(walletResult.data?.reserved_balance),
    currency: walletCurrency,
    updated_at: walletResult.data?.updated_at || null,
  },
  prior_direction_approval: {
    contract: currentApproval.contract || null,
    id: currentApproval.id || null,
    status: currentApprovalStatus || null,
    approved: currentApproval.approved === true,
    provider: currentApproval.provider || null,
    model: currentApproval.model || null,
    pricing_id: currentApproval.pricing_id || null,
    currency: currentApproval.currency || null,
    maximum_calls: finite(currentApproval.maximum_calls),
    call_count: finite(currentApproval.call_count) || 0,
    exhausted: currentApprovalExhausted,
    allowed_operations: list(currentApproval.allowed_operations),
    reusable_for_versioned_direction: false,
  },
  required_approval_contract: {
    contract: DIRECTION_APPROVAL_CONTRACT,
    must_bind_reconciliation_plan_hash: true,
    must_bind_research_identity: true,
    must_bind_command_identity: true,
    must_choose_exact_candidate_hash: true,
    must_use_exact_allowed_operations: true,
    maximum_calls_must_equal_workload_ceiling: true,
    provider_and_pricing_must_be_explicit: true,
    expiry_required: true,
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

const envelopeHash = sha256(envelopeCore);
const output = {
  contract: CONTRACT,
  generated_at: new Date().toISOString(),
  envelope_hash: envelopeHash,
  ...envelopeCore,
  blockers: [
    ...(approvalReadyCandidates.length
      ? []
      : ["NO_APPROVAL_READY_REASONING_PRICING_CANDIDATE"]),
    ...(!project.metadata?.command_identity
      ? ["PROJECT_COMMAND_IDENTITY_REQUIRED"]
      : []),
  ],
  decision: approvalReadyCandidates.length && project.metadata?.command_identity
    ? "DIRECTION_APPROVAL_ENVELOPE_READY_FOR_EXPLICIT_CANDIDATE_SELECTION"
    : "DIRECTION_APPROVAL_ENVELOPE_NOT_READY",
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
  process.env.CREATIVE_VERSIONED_DIRECTION_APPROVAL_ENVELOPE_OUTPUT ||
    "/tmp/creative-versioned-direction-approval-envelope.json",
  output,
);

console.log("============================================================");
console.log("READ-ONLY CREATIVE VERSIONED DIRECTION APPROVAL ENVELOPE");
console.log("============================================================");
console.log(`CONTRACT=${output.contract}`);
console.log(`OUTPUT=${outputPath}`);
console.log(`ENVELOPE_HASH=${output.envelope_hash}`);
console.log(`RECONCILIATION_PLAN_HASH=${output.reconciliation_plan_hash}`);
console.log(`RESEARCH_IDENTITY=${output.research_identity || ""}`);
console.log(`COMMAND_IDENTITY=${output.command_identity || ""}`);
console.log(`DURATION_SECONDS=${output.workflow.duration_seconds}`);
console.log(`MUSIC_VIDEO=${output.workflow.music_video ? "YES" : "NO"}`);
console.log(`SCENE_COUNT_MIN=${output.workflow.scene_count_range.minimum}`);
console.log(`SCENE_COUNT_PREFERRED=${output.workflow.scene_count_range.preferred}`);
console.log(`SCENE_COUNT_MAX=${output.workflow.scene_count_range.maximum}`);
console.log(`CALL_COUNT_MIN=${output.workload.minimum.call_count}`);
console.log(`CALL_COUNT_PREFERRED=${output.workload.preferred.call_count}`);
console.log(`CALL_COUNT_MAX=${output.workload.maximum.call_count}`);
console.log(`ALLOWED_OPERATIONS=${JSON.stringify(output.exact_allowed_operations)}`);
console.log(`WALLET_CURRENCY=${output.wallet.currency}`);
console.log(`WALLET_AVAILABLE_BALANCE=${output.wallet.available_balance}`);
console.log(`PRICING_CANDIDATE_COUNT=${output.pricing.candidate_count}`);
console.log(`APPROVAL_READY_PRICING_CANDIDATE_COUNT=${output.pricing.approval_ready_candidate_count}`);
for (const candidate of output.pricing.candidates) {
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
console.log(`PRIOR_APPROVAL_STATUS=${output.prior_direction_approval.status || ""}`);
console.log(`PRIOR_APPROVAL_EXHAUSTED=${output.prior_direction_approval.exhausted ? "YES" : "NO"}`);
console.log(`PRIOR_APPROVAL_REUSABLE=NO`);
console.log(`BLOCKERS=${JSON.stringify(output.blockers)}`);
console.log(`DECISION=${output.decision}`);
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

if (output.blockers.length) process.exitCode = 2;
