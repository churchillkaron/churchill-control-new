#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const EXECUTION_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPLACEMENT_REVIEW_EXECUTION_V1";
const CHECKPOINT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPLACEMENT_REVIEW_EXECUTION_CHECKPOINT_V1";
const SOURCE_AUDIT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_BOUNDED_POLL_RESULT_AUDIT_V1";
const REPORT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPLACEMENT_REVIEW_RESULT_AUDIT_V1";
const REVIEW_REJECTION = "GENERATED_MEDIA_PERCEPTUAL_VALIDATION_FAILED";
const SCORE_KEYS = Object.freeze([
  "overall_score",
  "story_score",
  "environment_score",
  "camera_score",
  "anatomy_score",
  "identity_score",
  "product_fidelity_score",
  "music_energy_score",
  "performance_score",
  "continuity_score",
  "physics_score",
  "artifact_score",
]);

const text = (value) => String(value ?? "").trim();
const object = (value) =>
  value && typeof value === "object" && !Array.isArray(value) ? value : {};
const list = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
const money = (value) => Number(Number(value || 0).toFixed(6));

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
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
    raw,
    file_sha256: sha256(raw),
    value: JSON.parse(raw),
  };
}

function writeJson(filePath, value) {
  const absolute = path.resolve(filePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function taskState(task = {}) {
  return {
    id: task.id,
    status: task.status,
    provider_id: task.provider_id ?? null,
    cost: task.cost || {},
    error: task.error || null,
    depends_on: task.depends_on || [],
    review: task.review || {},
    metadata: task.metadata || {},
    output: task.output || {},
    timing: task.timing || {},
    updated_at: task.updated_at || null,
  };
}

function taskFingerprint(tasks = []) {
  return sha256(
    [...tasks]
      .sort((left, right) => text(left.id).localeCompare(text(right.id)))
      .map(taskState),
  );
}

function taskCounts(tasks = []) {
  return tasks.reduce((result, task) => {
    const status = text(task.status) || "UNKNOWN";
    result[status] = Number(result[status] || 0) + 1;
    return result;
  }, {});
}

function expectedContract(task = {}) {
  return object(
    task.input?.requirements?.expected_contract ||
      task.metadata?.requirements?.expected_contract,
  );
}

function thresholds(task = {}) {
  return {
    ...object(expectedContract(task).thresholds),
    ...object(task.input?.requirements?.thresholds),
    ...object(task.metadata?.thresholds),
  };
}

function outputMediaUrl(value, seen = new Set()) {
  if (!value) return null;
  if (typeof value === "string") {
    return /^(https?:\/\/|storage:\/\/|s3:\/\/|gs:\/\/)/i.test(value)
      ? value
      : null;
  }
  if (typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => outputMediaUrl(item, seen)).find(Boolean) || null;
  }
  for (const key of [
    "url",
    "file_url",
    "fileUrl",
    "video_url",
    "videoUrl",
    "download_url",
    "downloadUrl",
    "output",
    "outputs",
    "result",
    "results",
    "data",
    "files",
    "videos",
    "provider_poll",
    "provider_submission",
  ]) {
    const found = outputMediaUrl(value[key], seen);
    if (found) return found;
  }
  return null;
}

function normalizedMessages(value) {
  return list(value).map((item) => {
    if (typeof item === "string") return text(item);
    if (!item || typeof item !== "object") return text(item);
    return text(
      item.message ||
        item.failure ||
        item.issue ||
        item.instruction ||
        item.description ||
        JSON.stringify(item),
    );
  }).filter(Boolean);
}

function increment(result, key) {
  if (!key) return;
  result[key] = Number(result[key] || 0) + 1;
}

function classificationFor({
  providerPassed,
  scoreContractComplete,
  falseScoreChecks,
  falseEvidenceChecks,
  evidenceDecisionSources,
  failures,
  repairs,
}) {
  if (!scoreContractComplete) return "TECHNICAL_SCORE_CONTRACT_REJECTION";
  if (falseScoreChecks.includes("frame_evidence")) {
    return "TECHNICAL_FRAME_EVIDENCE_REJECTION";
  }
  if (providerPassed) {
    if (falseScoreChecks.length === 0 && falseEvidenceChecks.length > 0) {
      const onlyMissing = falseEvidenceChecks.every(
        (key) =>
          evidenceDecisionSources[key] ===
          "MISSING_WITHOUT_CONCLUSIVE_SUPPORT",
      );
      return onlyMissing
        ? "PROVIDER_PASS_MISSING_EVIDENCE_POLICY_REJECTION"
        : "PROVIDER_PASS_EXPLICIT_EVIDENCE_REJECTION";
    }
    return "PROVIDER_PASS_SCORE_OR_POLICY_REJECTION";
  }
  if (failures.length > 0 || repairs.length > 0) {
    return "PROVIDER_CONTENT_REJECTION";
  }
  return "PROVIDER_UNEXPLAINED_REJECTION";
}

async function exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
}) {
  const [tasks, usage, wallet] = await Promise.all([
    ProductionTaskRuntime.list({
      organization_id: organizationId,
      creative_project_id: projectId,
      production_graph_id: graphId,
    }),
    supabaseAdmin
      .from("platform_service_usage")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabaseAdmin
      .from("organization_wallets")
      .select("available_balance,reserved_balance,currency,updated_at")
      .eq("organization_id", organizationId)
      .single(),
  ]);
  if (usage.error) throw usage.error;
  if (wallet.error) throw wallet.error;
  const scopedTasks = tasks.filter(
    (task) => text(task.production_graph_id) === graphId,
  );
  return {
    tasks: scopedTasks,
    task_count: scopedTasks.length,
    task_status_counts: taskCounts(scopedTasks),
    task_state_sha256: taskFingerprint(scopedTasks),
    usage_count: Number(usage.count || 0),
    wallet_balance: money(wallet.data?.available_balance),
    wallet_reserved_balance: money(wallet.data?.reserved_balance),
    wallet_currency: text(wallet.data?.currency) || "THB",
    wallet_updated_at: wallet.data?.updated_at || null,
  };
}

const executionFile = readJson(
  process.argv[2],
  "REPLACEMENT_REVIEW_EXECUTION",
);
const checkpointFile = readJson(
  process.argv[3],
  "REPLACEMENT_REVIEW_CHECKPOINT",
);
const sourceAuditFile = readJson(
  process.argv[4],
  "COMPLETED_SOURCE_RESULT_AUDIT",
);
const execution = object(executionFile.value);
const checkpoint = object(checkpointFile.value);
const sourceAudit = object(sourceAuditFile.value);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_REPLACEMENT_REVIEW_RESULT_AUDIT_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-replacement-review-result-audit.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("REPLACEMENT_REVIEW_RESULT_AUDIT_SCOPE_REQUIRED");
}

const [
  { supabaseAdmin },
  { ProductionTaskRuntime },
  { CreativeGeneratedMediaPerceptualExecutionGate },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate"),
]);

const blockers = [];
const requireValue = (condition, label) => {
  if (!condition) blockers.push(label);
};

requireValue(
  text(execution.contract) === EXECUTION_CONTRACT,
  "EXECUTION_CONTRACT_INVALID",
);
requireValue(
  text(checkpoint.contract) === CHECKPOINT_CONTRACT,
  "CHECKPOINT_CONTRACT_INVALID",
);
requireValue(
  text(sourceAudit.contract) === SOURCE_AUDIT_CONTRACT,
  "SOURCE_AUDIT_CONTRACT_INVALID",
);
for (const [label, value] of [
  ["EXECUTION", execution],
  ["CHECKPOINT", checkpoint],
  ["SOURCE_AUDIT", sourceAudit],
]) {
  requireValue(
    text(value.organization_id) === organizationId &&
      text(value.creative_project_id) === projectId &&
      text(value.production_graph_id) === graphId,
    `${label}_SCOPE_INVALID`,
  );
}
requireValue(
  text(execution.decision) ===
      "REPLACEMENT_PERCEPTUAL_REVIEW_9_TASKS_EXECUTED" &&
    text(execution.readiness) ===
      "READY_FOR_READ_ONLY_REPLACEMENT_PERCEPTUAL_REVIEW_RESULT_AUDIT" &&
    Number(execution.provider_call_count) === 9 &&
    Number(execution.passed_count) === 0 &&
    Number(execution.rejected_count) === 9 &&
    Number(execution.technical_failed_count) === 0 &&
    Number(execution.exception_count) === 0 &&
    Number(execution.unattempted_count) === 0 &&
    list(execution.blockers).length === 0 &&
    execution.retries_executed === false &&
    execution.source_regeneration_executed === false &&
    execution.runway_polls_executed === false &&
    execution.finalisation_executed === false &&
    execution.publication_executed === false,
  "EXECUTION_NOT_CLEAN_NINE_REJECTIONS",
);
requireValue(
  text(checkpoint.status) === "EXECUTION_COMPLETED" &&
    Number(checkpoint.provider_call_count) === 9 &&
    Number(checkpoint.passed_count) === 0 &&
    Number(checkpoint.rejected_count) === 9 &&
    Number(checkpoint.technical_failed_count) === 0 &&
    Number(checkpoint.exception_count) === 0 &&
    list(checkpoint.records).length === 9 &&
    list(checkpoint.records).every(
      (record) =>
        text(record.state) === "REVIEW_REJECTED" &&
        Number(record.provider_call_count) === 1 &&
        record.result?.source_asset_preserved === true,
    ),
  "CHECKPOINT_NOT_CLEAN_NINE_REJECTIONS",
);
requireValue(
  text(sourceAudit.decision) ===
      "REPAIR_SOURCE_9_COMPLETED_VIDEO_ASSETS_CONFIRMED" &&
    Number(sourceAudit.source_ready_count) === 9 &&
    Number(sourceAudit.source_failure_count) === 0 &&
    list(sourceAudit.blockers).length === 0,
  "SOURCE_AUDIT_NOT_CLEAN",
);

const before = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const taskMap = new Map(before.tasks.map((task) => [text(task.id), task]));
const records = list(checkpoint.records);
const reviewIds = records.map((record) => text(record.review_task_id));
const sourceIds = records.map((record) => text(record.source_task_id));
const assetIds = records.map((record) => text(record.asset_node_id));
const usageIds = records.map((record) => text(record.usage_id));

requireValue(before.task_count === 45, "LIVE_TASK_COUNT_INVALID");
requireValue(
  before.task_state_sha256 === text(execution.exact_state_after?.task_state_sha256) &&
    before.task_state_sha256 === text(checkpoint.final_task_state_sha256) &&
    before.usage_count === Number(execution.exact_state_after?.usage_count) &&
    before.wallet_balance === money(execution.exact_state_after?.wallet_balance) &&
    before.wallet_reserved_balance === 0,
  "LIVE_EXECUTION_STATE_CHANGED",
);
requireValue(
  new Set(reviewIds).size === 9 &&
    new Set(sourceIds).size === 9 &&
    new Set(assetIds).size === 9 &&
    new Set(usageIds).size === 9 &&
    reviewIds.every(Boolean) &&
    sourceIds.every(Boolean) &&
    assetIds.every(Boolean) &&
    usageIds.every(Boolean),
  "RESULT_IDENTIFIER_SET_INVALID",
);

const [assetResponse, usageResponse, invoiceLineResponse] = await Promise.all([
  supabaseAdmin
    .from("creative_asset_nodes")
    .select("id,type,status,production_task_id,metadata,url,storage_path")
    .in("id", assetIds),
  supabaseAdmin
    .from("platform_service_usage")
    .select("*")
    .in("id", usageIds),
  supabaseAdmin
    .from("billing_invoice_lines")
    .select("*")
    .in("usage_id", usageIds),
]);
for (const response of [assetResponse, usageResponse, invoiceLineResponse]) {
  if (response.error) throw response.error;
}
const assetMap = new Map(
  list(assetResponse.data).map((row) => [text(row.id), row]),
);
const usageMap = new Map(
  list(usageResponse.data).map((row) => [text(row.id), row]),
);
const invoiceLineMap = new Map(
  list(invoiceLineResponse.data).map((row) => [text(row.usage_id), row]),
);

const results = records.map((record) => {
  const review = taskMap.get(text(record.review_task_id));
  const source = taskMap.get(text(record.source_task_id));
  const asset = assetMap.get(text(record.asset_node_id));
  const usage = usageMap.get(text(record.usage_id));
  const invoiceLine = invoiceLineMap.get(text(record.usage_id));
  const evaluated = object(review?.output?.perceptual_validation);
  const fallbackEvaluated = Object.keys(evaluated).length
    ? evaluated
    : CreativeGeneratedMediaPerceptualExecutionGate.validation(review || {});
  const evidence = object(fallbackEvaluated.evidence);
  const checks = object(fallbackEvaluated.checks);
  const evidenceChecks = object(fallbackEvaluated.evidence_checks);
  const policy = object(fallbackEvaluated.evidence_policy);
  const decisions = object(policy.decisions);
  const scoreContract = object(fallbackEvaluated.score_contract);
  const expected = expectedContract(review);
  const minimums = thresholds(review);
  const falseScoreChecks = Object.entries(checks)
    .filter(([, passed]) => passed !== true)
    .map(([key]) => key)
    .sort();
  const falseEvidenceChecks = Object.entries(evidenceChecks)
    .filter(([, passed]) => passed !== true)
    .map(([key]) => key)
    .sort();
  const evidenceDecisionSources = Object.fromEntries(
    Object.entries(decisions).map(([key, decision]) => [
      key,
      text(decision?.source) || null,
    ]),
  );
  const failures = normalizedMessages(evidence.failures);
  const repairs = normalizedMessages(evidence.repair_instructions);
  const providerPassed = evidence.passed === true;
  const classification = classificationFor({
    providerPassed,
    scoreContractComplete: scoreContract.complete === true,
    falseScoreChecks,
    falseEvidenceChecks,
    evidenceDecisionSources,
    failures,
    repairs,
  });
  const issues = [];

  if (!review) issues.push("REVIEW_TASK_MISSING");
  if (!source) issues.push("SOURCE_TASK_MISSING");
  if (!asset) issues.push("ASSET_NODE_MISSING");
  if (!usage) issues.push("USAGE_ROW_MISSING");
  if (!invoiceLine) issues.push("INVOICE_LINE_MISSING");
  if (text(review?.status) !== "FAILED") issues.push("REVIEW_NOT_FAILED");
  if (text(review?.error) !== REVIEW_REJECTION) {
    issues.push("REVIEW_REJECTION_ERROR_INVALID");
  }
  if (text(source?.status) !== "FAILED") issues.push("SOURCE_NOT_FAILED");
  if (text(source?.error) !== REVIEW_REJECTION) {
    issues.push("SOURCE_REJECTION_ERROR_INVALID");
  }
  if (
    text(source?.output?.asset_node_id) !== text(asset?.id) ||
    !outputMediaUrl(source?.output)
  ) {
    issues.push("SOURCE_ASSET_NOT_PRESERVED");
  }
  if (
    text(asset?.type) !== "VIDEO" ||
    text(asset?.status) !== "GENERATED" ||
    text(asset?.metadata?.inspection_status) !== "COMPLETE"
  ) {
    issues.push("ASSET_NODE_INVALID");
  }
  if (text(usage?.status) !== "SUCCESS") issues.push("USAGE_NOT_SUCCESS");
  if (text(usage?.invoice_status) !== "INVOICED") {
    issues.push("USAGE_NOT_INVOICED");
  }
  if (!text(invoiceLine?.id)) issues.push("INVOICE_LINE_INVALID");
  if (fallbackEvaluated.passed === true) {
    issues.push("STORED_REJECTION_REEVALUATES_AS_PASS");
  }

  return {
    review_task_id: review?.id || null,
    source_task_id: source?.id || null,
    asset_node_id: asset?.id || null,
    usage_id: usage?.id || null,
    invoice_line_id: invoiceLine?.id || null,
    scene_id: review?.scene_id || source?.scene_id || null,
    shot_id: review?.shot_id || source?.shot_id || null,
    provider_passed: providerPassed,
    normalized_passed: fallbackEvaluated.passed === true,
    score_contract_complete: scoreContract.complete === true,
    score_contract_shape: scoreContract.source_shape || null,
    analyzed_image_count: evidence.analyzed_image_count ?? null,
    all_score_and_frame_checks_passed:
      policy.all_score_and_frame_checks_passed === true,
    conclusive_provider_verdict:
      policy.conclusive_provider_verdict === true,
    false_score_checks: falseScoreChecks,
    false_evidence_checks: falseEvidenceChecks,
    evidence_decision_sources: evidenceDecisionSources,
    missing_score_fields: list(scoreContract.missing_fields),
    invalid_score_fields: list(scoreContract.invalid_fields),
    out_of_range_score_fields: list(scoreContract.out_of_range_fields),
    conflicting_score_fields: list(scoreContract.conflicting_fields),
    expected_flags: {
      person_expected: expected.person_expected === true,
      identity_expected: expected.identity_expected === true,
      product_expected: expected.product_expected === true,
      music_expected: expected.music_expected === true,
      media_kind: text(expected.media_kind),
    },
    thresholds: minimums,
    scores: Object.fromEntries(
      SCORE_KEYS.map((key) => [key, evidence[key] ?? null]),
    ),
    failures,
    repair_instructions: repairs,
    failure_count: failures.length,
    repair_instruction_count: repairs.length,
    classification,
    source_asset_preserved: issues.includes("SOURCE_ASSET_NOT_PRESERVED") === false,
    usage_success: text(usage?.status) === "SUCCESS",
    invoiced: text(usage?.invoice_status) === "INVOICED",
    actual_customer_price: money(usage?.customer_price),
    issues,
    structurally_valid: issues.length === 0,
  };
});

const classificationCounts = {};
const failureConditionCounts = {};
const evidenceDecisionSourceCounts = {};
for (const result of results) {
  increment(classificationCounts, result.classification);
  for (const key of result.false_score_checks) {
    increment(failureConditionCounts, `score_or_frame:${key}`);
  }
  for (const key of result.false_evidence_checks) {
    increment(failureConditionCounts, `evidence:${key}`);
    increment(
      evidenceDecisionSourceCounts,
      `${key}:${result.evidence_decision_sources[key] || "UNKNOWN"}`,
    );
  }
  for (const failure of result.failures) {
    increment(failureConditionCounts, `provider_failure:${failure}`);
  }
}

const providerPassCount = results.filter((item) => item.provider_passed).length;
const providerPassBlockedCount = results.filter(
  (item) => item.provider_passed && !item.normalized_passed,
).length;
const technicalRejectionCount = results.filter((item) =>
  item.classification.startsWith("TECHNICAL_"),
).length;
const providerContentRejectionCount = results.filter(
  (item) => item.classification === "PROVIDER_CONTENT_REJECTION",
).length;
const providerPolicyRejectionCount = results.filter((item) =>
  item.classification.startsWith("PROVIDER_PASS_"),
).length;
const structurallyValidCount = results.filter(
  (item) => item.structurally_valid,
).length;
const assetPreservedCount = results.filter(
  (item) => item.source_asset_preserved,
).length;
const invoicedCount = results.filter((item) => item.invoiced).length;
const actualSpendFromUsage = money(
  results.reduce(
    (sum, item) => sum + Number(item.actual_customer_price || 0),
    0,
  ),
);
const systemicConditions = Object.entries(failureConditionCounts)
  .filter(([, count]) => Number(count) >= 7)
  .sort((left, right) => Number(right[1]) - Number(left[1]))
  .map(([condition, count]) => ({ condition, count }));
const systemicFailureCandidate =
  systemicConditions.length > 0 ||
  providerPassBlockedCount >= 7 ||
  technicalRejectionCount >= 7;

requireValue(results.length === 9, "RESULT_COUNT_INVALID");
requireValue(structurallyValidCount === 9, "ONE_OR_MORE_RESULTS_STRUCTURALLY_INVALID");
requireValue(assetPreservedCount === 9, "ONE_OR_MORE_ASSETS_NOT_PRESERVED");
requireValue(invoicedCount === 9, "ONE_OR_MORE_REVIEWS_NOT_INVOICED");
requireValue(
  actualSpendFromUsage === money(execution.actual_spend),
  "USAGE_SPEND_DOES_NOT_MATCH_EXECUTION",
);

const protectedIds = new Set(list(checkpoint.protected_task_ids).map(text));
const protectedStateSha = taskFingerprint(
  before.tasks.filter((task) => protectedIds.has(text(task.id))),
);
requireValue(
  protectedIds.size === 27 &&
    protectedStateSha === text(checkpoint.protected_task_state_sha256),
  "PROTECTED_TASK_STATE_CHANGED",
);

const after = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const stateUnchanged =
  before.task_count === after.task_count &&
  before.task_state_sha256 === after.task_state_sha256 &&
  before.usage_count === after.usage_count &&
  before.wallet_balance === after.wallet_balance &&
  before.wallet_reserved_balance === after.wallet_reserved_balance &&
  before.wallet_updated_at === after.wallet_updated_at;
if (!stateUnchanged) blockers.push("READ_ONLY_RESULT_AUDIT_CHANGED_STATE");

let decision = "REPLACEMENT_REVIEW_REJECTIONS_IDENTIFIED";
let readiness = "READY_FOR_SHOT_LEVEL_CREATIVE_REPAIR_DECISION";
let instruction =
  "Use the provider failures and repair instructions shot by shot. Do not rerun reviews or regenerate all sources. Preserve every existing asset and decide only the isolated rejected shots.";

if (technicalRejectionCount > 0) {
  decision = "REPLACEMENT_REVIEW_TECHNICAL_REJECTIONS_IDENTIFIED";
  readiness = "READY_FOR_TECHNICAL_FALSE_NEGATIVE_RECONCILIATION_PREVIEW";
  instruction =
    "Treat technical score or frame-contract rejections as non-creative failures. Prepare a no-provider-call reconciliation preview before any regeneration.";
} else if (providerPolicyRejectionCount > 0) {
  decision = "REPLACEMENT_REVIEW_PROVIDER_PASS_POLICY_REJECTIONS_IDENTIFIED";
  readiness = "READY_FOR_EVIDENCE_POLICY_RECONCILIATION_PREVIEW";
  instruction =
    "The provider passed one or more videos but the local evidence policy rejected them. Prepare a no-provider-call targeted reconciliation preview for only those disagreements before any regeneration.";
} else if (providerContentRejectionCount === 9) {
  decision = "REPLACEMENT_REVIEW_NINE_PROVIDER_CONTENT_REJECTIONS_IDENTIFIED";
  readiness = "READY_FOR_EDITORIAL_TRIAGE_BEFORE_REGENERATION";
  instruction =
    "All nine providers explicitly rejected content. Preserve all videos and extract a contact sheet or low-resolution editorial review package before deciding whether FFmpeg can salvage usable segments or whether individual shots need regeneration.";
}

const report = {
  contract: REPORT_CONTRACT,
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  execution_file: executionFile.absolute,
  execution_file_sha256: executionFile.file_sha256,
  checkpoint_file: checkpointFile.absolute,
  checkpoint_file_sha256: checkpointFile.file_sha256,
  source_audit_file: sourceAuditFile.absolute,
  source_audit_file_sha256: sourceAuditFile.file_sha256,
  review_task_count: results.length,
  provider_pass_count: providerPassCount,
  provider_pass_blocked_count: providerPassBlockedCount,
  technical_rejection_count: technicalRejectionCount,
  provider_policy_rejection_count: providerPolicyRejectionCount,
  provider_content_rejection_count: providerContentRejectionCount,
  structurally_valid_count: structurallyValidCount,
  asset_preserved_count: assetPreservedCount,
  invoiced_count: invoicedCount,
  actual_spend: actualSpendFromUsage,
  classification_counts: classificationCounts,
  failure_condition_counts: failureConditionCounts,
  evidence_decision_source_counts: evidenceDecisionSourceCounts,
  systemic_conditions: systemicConditions,
  systemic_failure_candidate: systemicFailureCandidate,
  results,
  protected_task_count: protectedIds.size,
  protected_task_state_sha256: protectedStateSha,
  blockers,
  decision,
  instruction,
  exact_state_before: {
    task_count: before.task_count,
    task_status_counts: before.task_status_counts,
    task_state_sha256: before.task_state_sha256,
    usage_count: before.usage_count,
    wallet_balance: before.wallet_balance,
    wallet_reserved_balance: before.wallet_reserved_balance,
  },
  exact_state_after: {
    task_count: after.task_count,
    task_status_counts: after.task_status_counts,
    task_state_sha256: after.task_state_sha256,
    usage_count: after.usage_count,
    wallet_balance: after.wallet_balance,
    wallet_reserved_balance: after.wallet_reserved_balance,
  },
  state_unchanged: stateUnchanged,
  database_writes_executed: false,
  provider_calls_executed: false,
  provider_polls_executed: false,
  review_reruns_executed: false,
  wallet_mutations_executed: false,
  source_regeneration_executed: false,
  reconciliation_executed: false,
  finalisation_executed: false,
  publication_executed: false,
  readiness,
};

writeJson(outputPath, report);

console.log("============================================================");
console.log("READ-ONLY REPLACEMENT PERCEPTUAL REVIEW RESULT AUDIT");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`REVIEW_TASK_COUNT=${results.length}`);
console.log(`PROVIDER_PASS_COUNT=${providerPassCount}`);
console.log(`PROVIDER_PASS_BLOCKED_COUNT=${providerPassBlockedCount}`);
console.log(`TECHNICAL_REJECTION_COUNT=${technicalRejectionCount}`);
console.log(`PROVIDER_POLICY_REJECTION_COUNT=${providerPolicyRejectionCount}`);
console.log(`PROVIDER_CONTENT_REJECTION_COUNT=${providerContentRejectionCount}`);
console.log(`STRUCTURALLY_VALID_COUNT=${structurallyValidCount}`);
console.log(`ASSET_PRESERVED_COUNT=${assetPreservedCount}`);
console.log(`INVOICED_COUNT=${invoicedCount}`);
console.log(`ACTUAL_SPEND=${actualSpendFromUsage}`);
console.log(`CLASSIFICATION_COUNTS=${JSON.stringify(classificationCounts)}`);
console.log(`FAILURE_CONDITION_COUNTS=${JSON.stringify(failureConditionCounts)}`);
console.log(`EVIDENCE_DECISION_SOURCE_COUNTS=${JSON.stringify(evidenceDecisionSourceCounts)}`);
console.log(`SYSTEMIC_CONDITIONS=${JSON.stringify(systemicConditions)}`);
console.log(`SYSTEMIC_FAILURE_CANDIDATE=${systemicFailureCandidate ? "YES" : "NO"}`);

for (const result of results) {
  console.log([
    `REVIEW_RESULT_AUDIT=${result.review_task_id}`,
    `source=${result.source_task_id}`,
    `scene=${result.scene_id || ""}`,
    `shot=${result.shot_id || ""}`,
    `classification=${result.classification}`,
    `provider_passed=${result.provider_passed ? "YES" : "NO"}`,
    `score_contract_complete=${result.score_contract_complete ? "YES" : "NO"}`,
    `frames=${result.analyzed_image_count ?? ""}`,
    `false_scores=${result.false_score_checks.join(",")}`,
    `false_evidence=${result.false_evidence_checks.join(",")}`,
    `failures=${result.failure_count}`,
    `repairs=${result.repair_instruction_count}`,
    `asset_preserved=${result.source_asset_preserved ? "YES" : "NO"}`,
    `issues=${result.issues.join(",")}`,
  ].join("|"));

  for (const failure of result.failures) {
    console.log([
      `PROVIDER_FAILURE=${result.review_task_id}`,
      `scene=${result.scene_id || ""}`,
      `shot=${result.shot_id || ""}`,
      `failure=${failure.replaceAll("|", "/")}`,
    ].join("|"));
  }
  for (const repair of result.repair_instructions) {
    console.log([
      `PROVIDER_REPAIR=${result.review_task_id}`,
      `scene=${result.scene_id || ""}`,
      `shot=${result.shot_id || ""}`,
      `instruction=${repair.replaceAll("|", "/")}`,
    ].join("|"));
  }
}

console.log(`RESULT_AUDIT_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`RESULT_AUDIT_DECISION=${decision}`);
console.log(`RESULT_AUDIT_INSTRUCTION=${instruction}`);
console.log(`TASK_STATE_SHA256_BEFORE=${before.task_state_sha256}`);
console.log(`TASK_STATE_SHA256_AFTER=${after.task_state_sha256}`);
console.log(`USAGE_COUNT_BEFORE=${before.usage_count}`);
console.log(`USAGE_COUNT_AFTER=${after.usage_count}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet_balance}`);
console.log(`WALLET_RESERVED_BALANCE_BEFORE=${before.wallet_reserved_balance}`);
console.log(`WALLET_RESERVED_BALANCE_AFTER=${after.wallet_reserved_balance}`);
console.log(`STATE_UNCHANGED=${stateUnchanged ? "YES" : "NO"}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("PROVIDER_POLLS_EXECUTED=NO");
console.log("REVIEW_RERUNS_EXECUTED=NO");
console.log("WALLET_MUTATIONS_EXECUTED=NO");
console.log("SOURCE_REGENERATION_EXECUTED=NO");
console.log("RECONCILIATION_EXECUTED=NO");
console.log("FINALISATION_EXECUTED=NO");
console.log("PUBLICATION_EXECUTED=NO");
console.log(`AUDIT_READINESS=${readiness}`);
console.log("TERMINAL_REMAINS_OPEN=YES");

if (blockers.length || !stateUnchanged) process.exitCode = 2;
