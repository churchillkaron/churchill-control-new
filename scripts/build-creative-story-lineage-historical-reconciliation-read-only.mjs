#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const CONTRACT = "CREATIVE_STORY_LINEAGE_HISTORICAL_RECONCILIATION_PLAN_V1";
const OUTPUT = path.resolve(
  process.env.CREATIVE_STORY_LINEAGE_RECONCILIATION_OUTPUT ||
  "/tmp/creative-story-lineage-historical-reconciliation-plan.json",
);

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

function unique(values = []) {
  return [...new Set(list(values).flat(Infinity).map(text).filter(Boolean))];
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
    file_sha256: sha256(raw),
    value: JSON.parse(raw),
  };
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sceneDisposition(scene = {}) {
  const issues = list(scene.issues);
  return {
    historical_scene_id: scene.persisted_scene_id || null,
    candidate_approved_plan_scene_id: scene.plan_scene_id || null,
    disposition: "PRESERVE_HISTORICAL_ONLY",
    authoritative_reuse_allowed: false,
    recreate_in_new_lineage_version: true,
    dropped_causal_fields: list(scene.dropped_causal_fields),
    issues,
    reason: scene.plan_scene_id
      ? "The persisted scene may be mapped for provenance, but it predates the authoritative lineage contract and must not be promoted in place."
      : "The persisted scene is not reliably mapped to the approved plan and must remain historical only.",
  };
}

function shotDisposition(shot = {}) {
  const issues = list(shot.issues);
  return {
    historical_shot_id: shot.persisted_shot_id || null,
    historical_scene_id: shot.persisted_scene_id || null,
    candidate_approved_plan_shot_id: shot.plan_shot_id || null,
    approved_subject: shot.approved_subject || null,
    historical_subject: shot.persisted_subject || null,
    persisted_prompt_paths: list(shot.prompt_paths),
    disposition: "PRESERVE_HISTORICAL_ONLY",
    authoritative_reuse_allowed: false,
    recreate_in_new_lineage_version: true,
    issues,
    reason: issues.length
      ? "The historical shot carries lineage, subject, plan-version, or persisted-prompt defects and cannot become authoritative through metadata patching."
      : "The shot belongs to the historical document set and must be recreated under the new lineage version even when its visible content maps cleanly.",
  };
}

function repairPairDisposition(pair = {}) {
  const strategy = object(pair.strategy_recommendation);
  const recursive = pair.materialization?.recursive === true ||
    pair.review_materialization?.recursive === true;
  return {
    historical_source_task_id: pair.replacement_source_task_id || null,
    historical_review_task_id: pair.replacement_review_task_id || null,
    canonical_shot_id: pair.canonical_shot_id || null,
    plan_shot_found: pair.plan_shot_found === true,
    graph_node_found: pair.graph_node_found === true,
    classification: pair.classification || null,
    historical_issues: list(pair.issues),
    recursive_materialization_detected: recursive,
    disposition: "HISTORICAL_MEDIA_FAILURE_EVIDENCE_ONLY",
    generation_spec_reuse_allowed: false,
    output_media_authority_allowed: false,
    recommended_future_method: strategy.method || null,
    recommended_future_method_reason: strategy.reason || null,
    primary_source_asset_id: strategy.primary_source_asset_id || null,
    reason: "The failed replacement pair may inform future shot strategy, but neither its materialization contract nor its provider-era generation specification may be reused as authority.",
  };
}

function classifyBlocker(blocker) {
  const historicalOnly = new Set([
    "CANONICAL_STORY_FIELDS_CONFLICT",
    "RESEARCH_IDENTITY_LINEAGE_MISSING_FROM_APPROVED_PLAN",
    "INDUSTRY_LINEAGE_MISSING_FROM_APPROVED_PLAN",
    "STORY_RESEARCH_EVIDENCE_REFERENCES_MISSING",
    "STRATEGY_AUTHORITATIVE_LINEAGE_INCOMPLETE",
    "CONCEPT_AUTHORITATIVE_LINEAGE_INCOMPLETE",
    "STORYBOARD_AUTHORITATIVE_LINEAGE_INCOMPLETE",
    "PERSISTED_CREATIVE_DOCUMENTS_DO_NOT_MATCH_APPROVED_PLAN_VERSION",
    "PERSISTED_PROVIDER_PROMPTS_COMPETE_WITH_STRUCTURED_DIRECTION",
    "GRAPH_VISIBLE_SUBJECT_COLLAPSED_INTO_PURPOSE",
  ]);
  return historicalOnly.has(blocker)
    ? "CURRENT_PROJECT_HISTORICAL_STATE"
    : "REQUIRES_SEPARATE_RUNTIME_REVIEW";
}

const input = readJson(
  process.argv[2],
  "STORY_LINEAGE_V2_AUDIT",
);
const audit = object(input.value);

if (!text(audit.organization_id) ||
    !text(audit.creative_project_id) ||
    !text(audit.production_graph_id)) {
  throw new Error("STORY_LINEAGE_RECONCILIATION_SCOPE_REQUIRED");
}
if (audit.state_unchanged !== true) {
  throw new Error("STORY_LINEAGE_RECONCILIATION_REQUIRES_READ_ONLY_AUDIT");
}

const authority = object(audit.story_authority);
const research = object(audit.research_lineage);
const blockers = unique(audit.proven_blockers);
const historicalDefects = unique(audit.historical_defects);
const scenes = list(audit.persisted_scenes).map(sceneDisposition);
const shots = list(audit.persisted_shots).map(shotDisposition);
const repairPairs = list(audit.replacement_mapping?.pairs).map(repairPairDisposition);
const blockerClassification = blockers.map((blocker) => ({
  blocker,
  classification: classifyBlocker(blocker),
}));
const unexpectedRuntimeReview = blockerClassification
  .filter((entry) => entry.classification === "REQUIRES_SEPARATE_RUNTIME_REVIEW")
  .map((entry) => entry.blocker);

const canonicalStoryDecision = authority.semantic_conflict_proven === true
  ? {
      historical_snapshot_status: "CONFLICTED_NON_AUTHORITATIVE",
      historical_preferred_field: authority.preferred_authority || null,
      promote_historical_story_as_new_authority: false,
      resolution: "GENERATE_NEW_VERSIONED_CANONICAL_STORY_UNDER_CURRENT_LINEAGE_RUNTIME",
      reason: "The historical approval snapshot contains conflicting canonical story fields, so a sidecar cannot safely declare either historical field to be the new authority.",
    }
  : {
      historical_snapshot_status: "HISTORICAL_NON_AUTHORITATIVE",
      historical_preferred_field: authority.preferred_authority || null,
      promote_historical_story_as_new_authority: false,
      resolution: "RECREATE_VERSIONED_CANONICAL_STORY_UNDER_CURRENT_LINEAGE_RUNTIME",
      reason: "The historical snapshot predates the immutable story-lineage contract and remains provenance only.",
    };

const reconciliationCore = {
  organization_id: audit.organization_id,
  creative_project_id: audit.creative_project_id,
  historical_production_graph_id: audit.production_graph_id,
  source_audit_file_sha256: input.file_sha256,
  source_audit_state_sha256: audit.exact_state_after_sha256 || null,
  canonical_story_decision: canonicalStoryDecision,
  historical_research_lineage: {
    research_identity_present_in_plan:
      research.research_identity_present_in_plan === true,
    industry_present_in_plan:
      research.industry_present_in_plan === true,
    story_evidence_path_count: list(research.story_evidence_paths).length,
    authoritative_for_new_version: false,
  },
  document_reconciliation: {
    historical_strategy_concept_storyboard_disposition:
      "PRESERVE_HISTORICAL_ONLY",
    create_new_versioned_strategy: true,
    create_new_versioned_concept: true,
    create_new_versioned_storyboard: true,
    create_new_versioned_scenes: true,
    create_new_versioned_shots: true,
    historical_scene_count: scenes.length,
    historical_shot_count: shots.length,
    scenes,
    shots,
  },
  graph_reconciliation: {
    historical_graph_id: audit.production_graph_id,
    historical_graph_disposition: "PRESERVE_HISTORICAL_ONLY",
    historical_graph_authoritative_for_dispatch: false,
    create_new_versioned_graph: true,
    copy_historical_generation_prompts: false,
    copy_historical_materialization_contracts: false,
    preserve_subject_separately_from_purpose: true,
    require_story_lineage_contract_v1: true,
    require_task_materialization_v2: true,
  },
  failed_media_reconciliation: {
    historical_pair_count: repairPairs.length,
    disposition: "FAILURE_EVIDENCE_ONLY",
    reuse_provider_generation_specifications: false,
    reuse_recursive_materialization_contracts: false,
    pairs: repairPairs,
  },
  blocker_classification: blockerClassification,
  historical_defects: historicalDefects,
  required_future_authority: {
    research_validation_required: true,
    research_identity_required: true,
    industry_context_hash_required: true,
    business_context_hash_required: true,
    research_evidence_references_required: true,
    one_canonical_story_authority_required: true,
    story_contract_hash_required: true,
    master_plan_hash_required: true,
    approval_plan_hash_required: true,
    strategy_lineage_hash_match_required: true,
    concept_lineage_hash_match_required: true,
    storyboard_lineage_hash_match_required: true,
    scene_lineage_hash_match_required: true,
    shot_lineage_hash_match_required: true,
    graph_lineage_hash_match_required: true,
    promptless_persistence_required: true,
    provider_serialization_boundary: "EXECUTION_TRANSPORT_ONLY",
  },
  execution_order_after_separate_authorization: [
    "Resolve authoritative validated research through the current research runtime.",
    "Create a new versioned approved plan carrying CREATIVE_STORY_LINEAGE_CONTRACT_V1.",
    "Create new versioned strategy, concept, storyboard, scenes and shots using only matching lineage hashes.",
    "Create a new production graph preserving visible subject separately from story purpose.",
    "Materialize production tasks through CREATIVE_PRODUCTION_TASK_MATERIALIZATION_V2.",
    "Run a read-only lineage verification on the new version before any provider dispatch.",
    "Only after a separate spend and execution authorization may new media work be dispatched.",
  ],
  forbidden_in_this_plan: [
    "historical row overwrite",
    "historical row deletion",
    "provider binding",
    "provider spend approval",
    "provider call",
    "provider poll",
    "task dispatch",
    "review rerun",
    "source regeneration",
    "finalisation",
    "publication",
  ],
  authorization: {
    historical_reconciliation_execution_authorized: false,
    database_writes_authorized: false,
    provider_selection_authorized: false,
    provider_spend_authorized: false,
    provider_calls_authorized: false,
    task_dispatch_authorized: false,
    source_regeneration_authorized: false,
    finalisation_authorized: false,
    publication_authorized: false,
  },
};

const planHash = sha256(reconciliationCore);
const report = {
  contract: CONTRACT,
  generated_at: new Date().toISOString(),
  plan_hash: planHash,
  ...reconciliationCore,
  counts: {
    proven_blockers: blockers.length,
    blockers_classified_as_current_project_historical_state:
      blockerClassification.filter((entry) =>
        entry.classification === "CURRENT_PROJECT_HISTORICAL_STATE").length,
    blockers_requiring_separate_runtime_review: unexpectedRuntimeReview.length,
    historical_defects: historicalDefects.length,
    historical_scenes: scenes.length,
    historical_shots: shots.length,
    failed_media_pairs: repairPairs.length,
    mapped_failed_media_pairs: repairPairs.filter((pair) =>
      pair.plan_shot_found && pair.graph_node_found).length,
  },
  unexpected_runtime_review_blockers: unexpectedRuntimeReview,
  decision: unexpectedRuntimeReview.length
    ? "RECONCILIATION_PLAN_BLOCKED_BY_UNCLASSIFIED_RUNTIME_FINDINGS"
    : "HISTORICAL_RECONCILIATION_PLAN_READY",
  readiness: unexpectedRuntimeReview.length
    ? "READY_FOR_BOUNDED_RUNTIME_REVIEW"
    : "READY_FOR_EXPLICIT_VERSIONED_RECONCILIATION_AUTHORIZATION",
  database_writes_executed: false,
  historical_rows_modified: false,
  provider_selection_executed: false,
  provider_spend_approved: false,
  provider_calls_executed: false,
  provider_polls_executed: false,
  review_reruns_executed: false,
  task_dispatch_executed: false,
  source_regeneration_executed: false,
  finalisation_executed: false,
  publication_executed: false,
};

writeJson(OUTPUT, report);

console.log("============================================================");
console.log("READ-ONLY CREATIVE STORY LINEAGE HISTORICAL RECONCILIATION");
console.log("============================================================");
console.log(`CONTRACT=${report.contract}`);
console.log(`OUTPUT=${OUTPUT}`);
console.log(`PLAN_HASH=${report.plan_hash}`);
console.log(`ORGANIZATION_ID=${report.organization_id}`);
console.log(`CREATIVE_PROJECT_ID=${report.creative_project_id}`);
console.log(`HISTORICAL_PRODUCTION_GRAPH_ID=${report.historical_production_graph_id}`);
console.log(`PROVEN_BLOCKER_COUNT=${report.counts.proven_blockers}`);
console.log(`HISTORICAL_BLOCKER_COUNT=${report.counts.blockers_classified_as_current_project_historical_state}`);
console.log(`UNCLASSIFIED_RUNTIME_BLOCKER_COUNT=${report.counts.blockers_requiring_separate_runtime_review}`);
console.log(`HISTORICAL_SCENE_COUNT=${report.counts.historical_scenes}`);
console.log(`HISTORICAL_SHOT_COUNT=${report.counts.historical_shots}`);
console.log(`FAILED_MEDIA_PAIR_COUNT=${report.counts.failed_media_pairs}`);
console.log(`MAPPED_FAILED_MEDIA_PAIR_COUNT=${report.counts.mapped_failed_media_pairs}`);
console.log(`CANONICAL_STORY_RESOLUTION=${report.canonical_story_decision.resolution}`);
console.log(`DECISION=${report.decision}`);
console.log(`READINESS=${report.readiness}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("HISTORICAL_ROWS_MODIFIED=NO");
console.log("PROVIDER_SELECTION_EXECUTED=NO");
console.log("PROVIDER_SPEND_APPROVED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("PROVIDER_POLLS_EXECUTED=NO");
console.log("REVIEW_RERUNS_EXECUTED=NO");
console.log("TASK_DISPATCH_EXECUTED=NO");
console.log("SOURCE_REGENERATION_EXECUTED=NO");
console.log("FINALISATION_EXECUTED=NO");
console.log("PUBLICATION_EXECUTED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

if (unexpectedRuntimeReview.length) process.exitCode = 2;
