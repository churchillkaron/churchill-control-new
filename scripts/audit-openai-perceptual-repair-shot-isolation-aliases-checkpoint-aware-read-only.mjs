#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const PRIOR_AUDIT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SHOT_ISOLATION_ALIAS_AUDIT_V1";
const PREVIEW_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_MATERIALIZATION_PREVIEW_V1";
const CHECKPOINT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_CHECKPOINT_V1";
const REPORT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SHOT_ISOLATION_ALIAS_AUDIT_V2";
const DISPATCH_AUTHORIZATION_CONTRACT =
  "CREATIVE_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_AUTHORIZATION_V1";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function money(value) {
  return Number(Number(value || 0).toFixed(6));
}

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

function authorizationValid(task = {}, dispatchContractSha) {
  const authorization = object(
    task.metadata?.repair_source_dispatch_authorization,
  );
  return Boolean(
    authorization.contract === DISPATCH_AUTHORIZATION_CONTRACT &&
      text(authorization.dispatch_contract_sha256) === dispatchContractSha &&
      authorization.provider_spend_authorized === true &&
      authorization.wallet_reservation_authorized === true &&
      authorization.provider_call_authorized === true &&
      authorization.dispatch_authorized === true &&
      authorization.poll_authorized === false &&
      authorization.review_execution_authorized === false &&
      authorization.retry_authorized === false &&
      authorization.finalisation_authorized === false &&
      authorization.publication_authorized === false &&
      task.metadata?.provider_spend_authorized === true &&
      task.metadata?.wallet_reservation_authorized === true &&
      task.metadata?.provider_call_authorized === true &&
      task.metadata?.dispatch_authorized === true &&
      task.metadata?.poll_authorized === false &&
      task.metadata?.review_execution_authorized === false &&
      task.metadata?.retry_authorized === false &&
      task.metadata?.finalisation_authorized === false &&
      task.metadata?.publication_authorized === false,
  );
}

function sourceBaseReady(task = {}) {
  return Boolean(
    task?.id &&
      text(task.status) === "WAITING" &&
      text(task.provider_id) === "runway" &&
      task.cost?.approved === true &&
      money(task.cost?.estimated) === 5.26032 &&
      Number(task.cost?.actual || 0) === 0 &&
      !task.timing?.started_at &&
      !task.timing?.completed_at &&
      Object.keys(object(task.output)).length === 0 &&
      !text(task.error),
  );
}

function reviewUntouched(review = {}, sourceTaskId) {
  return Boolean(
    review?.id &&
      text(review.status) === "WAITING" &&
      review.provider_id === null &&
      review.cost?.approved === false &&
      Number(review.cost?.actual || 0) === 0 &&
      list(review.depends_on).length === 1 &&
      text(review.depends_on[0]) === sourceTaskId &&
      !review.timing?.started_at &&
      !review.timing?.completed_at &&
      Object.keys(object(review.output)).length === 0 &&
      !text(review.error),
  );
}

function dossierMutationValid(task = {}) {
  return Boolean(
    task.metadata?.production_dossier_mode === "SEALED_PREPRODUCTION_GATE" &&
      task.metadata?.production_dossier_gate_passed === true &&
      task.metadata?.sealed_preproduction_gate_passed === true &&
      Number(task.metadata?.historical_production_task_count) === 45 &&
      Number(task.metadata?.active_production_task_count) === 27 &&
      Number(task.metadata?.superseded_production_task_count) === 18 &&
      Number(task.metadata?.superseded_production_source_count) === 9 &&
      Number(task.metadata?.superseded_production_review_count) === 9 &&
      money(task.metadata?.active_production_planned_cost) === 160.998794 &&
      money(task.metadata?.approved_cost_ceiling) === 367.366602 &&
      /^[a-f0-9]{64}$/i.test(text(task.metadata?.approved_manifest_hash)) &&
      /^[a-f0-9]{64}$/i.test(text(task.metadata?.approved_graph_hash)) &&
      /^[a-f0-9]{64}$/i.test(text(task.metadata?.approved_execution_hash)),
  );
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
      .select("available_balance,currency,updated_at")
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
    wallet_currency: text(wallet.data?.currency) || "THB",
    wallet_updated_at: wallet.data?.updated_at || null,
  };
}

const priorAuditFile = readJson(
  process.argv[2],
  "PRIOR_SHOT_ISOLATION_ALIAS_AUDIT",
);
const previewFile = readJson(
  process.argv[3],
  "BRIDGED_SOURCE_DISPATCH_PREVIEW",
);
const checkpointFile = readJson(
  process.argv[4],
  "SOURCE_DISPATCH_CHECKPOINT",
);
const priorAudit = object(priorAuditFile.value);
const preview = object(previewFile.value);
const checkpoint = object(checkpointFile.value);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_SHOT_ISOLATION_ALIAS_AUDIT_V2_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-repair-shot-isolation-alias-audit-v2.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("SHOT_ISOLATION_ALIAS_AUDIT_V2_SCOPE_REQUIRED");
}

const [{ supabaseAdmin }, { ProductionTaskRuntime }] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
]);

const blockers = [];
const requireValue = (condition, label) => {
  if (!condition) blockers.push(label);
};

requireValue(
  text(priorAudit.contract) === PRIOR_AUDIT_CONTRACT,
  "PRIOR_ALIAS_AUDIT_CONTRACT_INVALID",
);
requireValue(
  text(preview.contract) === PREVIEW_CONTRACT,
  "BRIDGED_PREVIEW_CONTRACT_INVALID",
);
requireValue(
  text(checkpoint.contract) === CHECKPOINT_CONTRACT,
  "CHECKPOINT_CONTRACT_INVALID",
);

for (const [label, value] of [
  ["PRIOR_AUDIT", priorAudit],
  ["PREVIEW", preview],
  ["CHECKPOINT", checkpoint],
]) {
  requireValue(
    text(value.organization_id) === organizationId &&
      text(value.creative_project_id) === projectId &&
      text(value.production_graph_id) === graphId,
    `${label}_SCOPE_INVALID`,
  );
}

requireValue(
  list(priorAudit.blockers).length === 1 &&
    priorAudit.blockers[0] === "TASK_STATE_CHANGED" &&
    priorAudit.state_unchanged === true &&
    Number(priorAudit.replacement_task_count) === 18 &&
    Number(priorAudit.valid_alias_count) === 18 &&
    Number(priorAudit.invalid_alias_count) === 0 &&
    Number(priorAudit.source_alias_count) === 9 &&
    Number(priorAudit.review_alias_count) === 9 &&
    Number(priorAudit.source_isolation_ready_count) === 9 &&
    Number(priorAudit.review_isolation_ready_count) === 9 &&
    Number(priorAudit.failed_isolation_audit_count) === 0 &&
    list(priorAudit.audits).length === 18 &&
    list(priorAudit.audits).every(
      (audit) => audit.ready === true && list(audit.issues).length === 0,
    ),
  "PRIOR_ALIAS_PROOF_INVALID",
);

requireValue(
  text(checkpoint.preview_file_sha256) === previewFile.file_sha256 &&
    text(checkpoint.dispatch_contract_sha256) ===
      text(preview.dispatch_contract_sha256),
  "CHECKPOINT_PREVIEW_LINKAGE_INVALID",
);
requireValue(
  text(checkpoint.status) === "IN_PROGRESS" &&
    list(checkpoint.source_records).length === 1 &&
    Number(checkpoint.initial_task_count) === 45 &&
    Number(checkpoint.initial_usage_count) === 2658 &&
    money(checkpoint.initial_wallet_balance) === 9300.972022 &&
    money(checkpoint.maximum_authorized_spend) === 47.34288 &&
    text(checkpoint.currency) === "THB",
  "CHECKPOINT_STATE_INVALID",
);

const before = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const taskMap = new Map(before.tasks.map((task) => [task.id, task]));
const plans = list(preview.dispatch_plans);
const sourceIds = new Set(plans.map((plan) => text(plan.source_task_id)));
const reviewIds = new Set(plans.map((plan) => text(plan.review_task_id)));
const protectedIds = new Set(list(checkpoint.protected_task_ids).map(text));

requireValue(before.task_count === 45, "LIVE_TASK_COUNT_INVALID");
requireValue(
  Number(before.task_status_counts.COMPLETED || 0) === 9 &&
    Number(before.task_status_counts.WAITING || 0) === 18 &&
    Number(before.task_status_counts.FAILED || 0) === 18,
  "LIVE_TASK_STATUS_COUNTS_INVALID",
);
requireValue(
  before.usage_count === Number(checkpoint.initial_usage_count) &&
    before.wallet_balance === money(checkpoint.initial_wallet_balance) &&
    before.wallet_updated_at === checkpoint.initial_wallet_updated_at,
  "ACCOUNTING_STATE_CHANGED",
);
requireValue(
  plans.length === 9 &&
    sourceIds.size === 9 &&
    reviewIds.size === 9 &&
    protectedIds.size === 36 &&
    [...sourceIds].every((id) => !protectedIds.has(id)) &&
    [...reviewIds].every((id) => protectedIds.has(id)),
  "TASK_PROTECTION_SCOPE_INVALID",
);

const protectedStateSha = taskFingerprint(
  before.tasks.filter((task) => protectedIds.has(task.id)),
);
requireValue(
  protectedStateSha === text(checkpoint.protected_task_state_sha256),
  "PROTECTED_TASK_STATE_CHANGED",
);

const dispatchContractSha = text(preview.dispatch_contract_sha256);
const sourceAudits = plans.map((plan) => {
  const source = taskMap.get(text(plan.source_task_id));
  const review = taskMap.get(text(plan.review_task_id));
  const authorized = authorizationValid(source, dispatchContractSha);
  const baseReady = sourceBaseReady(source);
  const dossierVerified = authorized && dossierMutationValid(source);
  const isolationNotExecuted = Boolean(
    source &&
      source.metadata?.strict_shot_asset_scope_verified !== true &&
      !source.input?.asset_scope,
  );
  const reviewSafe = reviewUntouched(review, text(source?.id));
  const issues = [];

  if (!source) issues.push("SOURCE_MISSING");
  if (!review) issues.push("REVIEW_MISSING");
  if (!baseReady) issues.push("SOURCE_BASE_STATE_INVALID");
  if (!reviewSafe) issues.push("REVIEW_STATE_CHANGED");

  if (authorized) {
    if (!dossierVerified) issues.push("DOSSIER_MUTATION_INVALID");
    if (!isolationNotExecuted) issues.push("ISOLATION_GATE_ALREADY_MUTATED_SOURCE");
  } else {
    if (source?.metadata?.dispatch_authorized === true) {
      issues.push("PARTIAL_DISPATCH_AUTHORIZATION_INVALID");
    }
    if (source?.metadata?.production_dossier_gate_passed === true) {
      issues.push("UNAUTHORIZED_SOURCE_HAS_DOSSIER_MUTATION");
    }
  }

  return {
    source_task_id: source?.id || null,
    review_task_id: review?.id || null,
    authorized,
    base_ready: baseReady,
    dossier_mutation_verified: dossierVerified,
    isolation_gate_not_executed: isolationNotExecuted,
    review_untouched: reviewSafe,
    issues,
    ready: issues.length === 0,
  };
});

const authorizedSourceCount = sourceAudits.filter(
  (audit) => audit.authorized,
).length;
const readySourceCount = sourceAudits.filter(
  (audit) => !audit.authorized && audit.base_ready,
).length;
const dossierMutationCount = sourceAudits.filter(
  (audit) => audit.dossier_mutation_verified,
).length;
const reviewUntouchedCount = sourceAudits.filter(
  (audit) => audit.review_untouched,
).length;
const sourceAuditFailureCount = sourceAudits.filter(
  (audit) => !audit.ready,
).length;

requireValue(
  authorizedSourceCount === 1 &&
    readySourceCount === 8 &&
    dossierMutationCount === 1 &&
    reviewUntouchedCount === 9 &&
    sourceAuditFailureCount === 0,
  "CHECKPOINT_AWARE_SOURCE_STATE_INVALID",
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
  before.wallet_updated_at === after.wallet_updated_at;
if (!stateUnchanged) {
  blockers.push("READ_ONLY_CHECKPOINT_AWARE_AUDIT_CHANGED_STATE");
}

const staleBaselineDetected =
  before.task_state_sha256 !==
  text(priorAudit.exact_state_after?.task_state_sha256);
const decision = blockers.length
  ? "REPAIR_SHOT_ISOLATION_ALIAS_CHECKPOINT_AUDIT_BLOCKED"
  : "REPAIR_SHOT_ISOLATION_18_VALID_NODE_ALIASES_CHECKPOINT_CONFIRMED";
const readiness = blockers.length
  ? "REPAIR_SHOT_ISOLATION_ALIAS_CHECKPOINT_AUDIT_BLOCKED"
  : "READY_FOR_SUPERSESSION_AWARE_SHOT_ISOLATION_GATE_RUNTIME_FIX";
const instruction = blockers.length
  ? "Resolve every checkpoint-aware isolation alias blocker. Do not resume dispatch."
  : "The prior TASK_STATE_CHANGED blocker was a stale-baseline artifact caused by one verified dossier-gate metadata mutation. Patch the shot-isolation gate to accept only validated repair-node aliases of authorized original graph nodes, then verify the gate read-only before resuming dispatch.";

const report = {
  contract: REPORT_CONTRACT,
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  prior_audit_file: priorAuditFile.absolute,
  prior_audit_file_sha256: priorAuditFile.file_sha256,
  preview_file: previewFile.absolute,
  preview_file_sha256: previewFile.file_sha256,
  checkpoint_file: checkpointFile.absolute,
  checkpoint_file_sha256: checkpointFile.file_sha256,
  prior_audit_only_blocker: priorAudit.blockers[0],
  stale_baseline_detected: staleBaselineDetected,
  live_task_count: before.task_count,
  live_task_status_counts: before.task_status_counts,
  source_task_count: sourceIds.size,
  review_task_count: reviewIds.size,
  protected_task_count: protectedIds.size,
  protected_task_state_sha256: protectedStateSha,
  authorized_source_count: authorizedSourceCount,
  ready_source_count: readySourceCount,
  verified_dossier_mutation_count: dossierMutationCount,
  review_untouched_count: reviewUntouchedCount,
  source_audit_failure_count: sourceAuditFailureCount,
  source_audits: sourceAudits,
  prior_aliases: priorAudit.aliases,
  prior_alias_audits: priorAudit.audits,
  blockers,
  decision,
  instruction,
  exact_state_before: {
    task_count: before.task_count,
    task_status_counts: before.task_status_counts,
    task_state_sha256: before.task_state_sha256,
    usage_count: before.usage_count,
    wallet_balance: before.wallet_balance,
    wallet_updated_at: before.wallet_updated_at,
  },
  exact_state_after: {
    task_count: after.task_count,
    task_status_counts: after.task_status_counts,
    task_state_sha256: after.task_state_sha256,
    usage_count: after.usage_count,
    wallet_balance: after.wallet_balance,
    wallet_updated_at: after.wallet_updated_at,
  },
  state_unchanged: stateUnchanged,
  database_writes_executed: false,
  wallet_reservations_executed: false,
  provider_calls_executed: false,
  provider_polls_executed: false,
  review_execution_executed: false,
  finalisation_executed: false,
  publication_executed: false,
  readiness,
};

writeJson(outputPath, report);

console.log("============================================================");
console.log("READ-ONLY CHECKPOINT-AWARE SHOT-ISOLATION ALIAS AUDIT");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`PRIOR_AUDIT_ONLY_BLOCKER=${priorAudit.blockers[0] || ""}`);
console.log(`STALE_BASELINE_DETECTED=${staleBaselineDetected ? "YES" : "NO"}`);
console.log(`TASK_COUNT=${before.task_count}`);
console.log(`TASK_STATUS_COUNTS=${JSON.stringify(before.task_status_counts)}`);
console.log(`SOURCE_TASK_COUNT=${sourceIds.size}`);
console.log(`REVIEW_TASK_COUNT=${reviewIds.size}`);
console.log(`PROTECTED_TASK_COUNT=${protectedIds.size}`);
console.log(`PROTECTED_TASK_STATE_SHA256=${protectedStateSha}`);
console.log(`AUTHORIZED_SOURCE_COUNT=${authorizedSourceCount}`);
console.log(`READY_SOURCE_COUNT=${readySourceCount}`);
console.log(`VERIFIED_DOSSIER_MUTATION_COUNT=${dossierMutationCount}`);
console.log(`REVIEW_UNTOUCHED_COUNT=${reviewUntouchedCount}`);
console.log(`SOURCE_AUDIT_FAILURE_COUNT=${sourceAuditFailureCount}`);

for (const audit of sourceAudits) {
  console.log([
    `CHECKPOINT_SOURCE_AUDIT=${audit.source_task_id || ""}`,
    `review=${audit.review_task_id || ""}`,
    `authorized=${audit.authorized ? "YES" : "NO"}`,
    `base_ready=${audit.base_ready ? "YES" : "NO"}`,
    `dossier_mutation=${audit.dossier_mutation_verified ? "PASS" : "N/A"}`,
    `isolation_not_executed=${audit.isolation_gate_not_executed ? "YES" : "NO"}`,
    `review_untouched=${audit.review_untouched ? "YES" : "NO"}`,
    `issues=${audit.issues.join(",")}`,
    `ready=${audit.ready ? "YES" : "NO"}`,
  ].join("|"));
}

console.log(`CHECKPOINT_ALIAS_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`CHECKPOINT_ALIAS_DECISION=${decision}`);
console.log(`CHECKPOINT_ALIAS_INSTRUCTION=${instruction}`);
console.log(`TASK_STATE_SHA256_BEFORE=${before.task_state_sha256}`);
console.log(`TASK_STATE_SHA256_AFTER=${after.task_state_sha256}`);
console.log(`USAGE_COUNT_BEFORE=${before.usage_count}`);
console.log(`USAGE_COUNT_AFTER=${after.usage_count}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet_balance}`);
console.log(`STATE_UNCHANGED=${stateUnchanged ? "YES" : "NO"}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("WALLET_RESERVATIONS_EXECUTED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("PROVIDER_POLLS_EXECUTED=NO");
console.log("REVIEW_EXECUTION_EXECUTED=NO");
console.log("FINALISATION_EXECUTED=NO");
console.log("PUBLICATION_EXECUTED=NO");
console.log(`AUDIT_READINESS=${readiness}`);
console.log("TERMINAL_REMAINS_OPEN=YES");

if (blockers.length || !stateUnchanged) {
  process.exitCode = 2;
}
