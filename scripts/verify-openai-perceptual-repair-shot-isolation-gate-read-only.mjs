#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const AUDIT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SHOT_ISOLATION_ALIAS_AUDIT_V1";
const CHECKPOINT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_CHECKPOINT_V1";
const REPORT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SHOT_ISOLATION_GATE_VERIFICATION_V1";
const SOURCE_CONTRACT =
  "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_SOURCE_V1";
const REVIEW_CONTRACT =
  "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_REVIEW_V1";

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

function repairKind(task = {}) {
  const contract = text(task.metadata?.repair_payload_contract);
  if (contract === SOURCE_CONTRACT) return "SOURCE";
  if (contract === REVIEW_CONTRACT) return "REVIEW";
  return null;
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
    wallet_updated_at: wallet.data?.updated_at || null,
  };
}

const auditFile = readJson(process.argv[2], "SHOT_ISOLATION_ALIAS_AUDIT");
const checkpointFile = readJson(
  process.argv[3],
  "SOURCE_DISPATCH_CHECKPOINT",
);
const audit = object(auditFile.value);
const checkpoint = object(checkpointFile.value);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_SHOT_ISOLATION_GATE_VERIFY_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-repair-shot-isolation-gate-verification.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("SHOT_ISOLATION_GATE_VERIFY_SCOPE_REQUIRED");
}

const [
  { supabaseAdmin },
  { ProductionTaskRuntime },
  { CreativeShotAssetIsolationExecutionGate },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/creative/assets/isolation/runtime/CreativeShotAssetIsolationExecutionGate"),
]);

const blockers = [];
const requireValue = (condition, label) => {
  if (!condition) blockers.push(label);
};

requireValue(
  text(audit.contract) === AUDIT_CONTRACT,
  "ALIAS_AUDIT_CONTRACT_INVALID",
);
requireValue(
  text(checkpoint.contract) === CHECKPOINT_CONTRACT,
  "CHECKPOINT_CONTRACT_INVALID",
);
for (const [label, value] of [
  ["AUDIT", audit],
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
  Number(audit.replacement_task_count) === 18 &&
    Number(audit.valid_alias_count) === 18 &&
    Number(audit.invalid_alias_count) === 0 &&
    Number(audit.source_alias_count) === 9 &&
    Number(audit.review_alias_count) === 9 &&
    Number(audit.source_isolation_ready_count) === 9 &&
    Number(audit.review_isolation_ready_count) === 9 &&
    Number(audit.failed_isolation_audit_count) === 0 &&
    list(audit.audits).length === 18 &&
    list(audit.audits).every(
      (item) => item.ready === true && list(item.issues).length === 0,
    ),
  "ALIAS_AUDIT_PROOF_INVALID",
);
requireValue(
  text(checkpoint.status) === "IN_PROGRESS" &&
    list(checkpoint.source_records).length === 1 &&
    Number(checkpoint.initial_task_count) === 45 &&
    Number(checkpoint.initial_usage_count) === 2658 &&
    money(checkpoint.initial_wallet_balance) === 9300.972022,
  "CHECKPOINT_STATE_INVALID",
);

const before = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const replacements = before.tasks.filter((task) => repairKind(task));

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
requireValue(replacements.length === 18, "REPLACEMENT_TASK_COUNT_INVALID");

const verifications = [];
for (const task of replacements) {
  const issues = [];
  let proof = null;
  try {
    proof = await CreativeShotAssetIsolationExecutionGate.evidence(task);
  } catch (error) {
    issues.push(error.message);
  }

  const kind = repairKind(task);
  const ownNodeId = text(task.metadata?.execution_node_id);
  const ownAlias = list(proof?.verifiedRepairAliases).find(
    (alias) => text(alias.replacement_node_id) === ownNodeId,
  );

  if (proof) {
    if (!ownAlias) issues.push("OWN_REPAIR_ALIAS_NOT_VERIFIED");
    if (proof.repairAliasEvidence.length !== 18) {
      issues.push("GRAPH_REPAIR_ALIAS_EVIDENCE_COUNT_INVALID");
    }
    if (kind === "SOURCE" && list(task.depends_on).length !== 0) {
      issues.push("SOURCE_DEPENDENCY_COUNT_INVALID");
    }
    if (
      kind === "REVIEW" &&
      (list(task.depends_on).length !== 1 ||
        proof.dependencies.taskIds.size !== 1 ||
        proof.dependencies.repairAliases.length !== 1)
    ) {
      issues.push("REVIEW_DEPENDENCY_ALIAS_INVALID");
    }
  }

  verifications.push({
    task_id: task.id,
    kind,
    execution_node_id: ownNodeId || null,
    creative_asset_count: proof?.creativeIds?.size || 0,
    asset_node_count: proof?.assetNodeIds?.size || 0,
    authorized_production_node_count: proof?.productionNodeIds?.size || 0,
    input_production_node_reference_count:
      proof?.ids?.productionNodes?.length || 0,
    allowed_media_count: proof?.allowedUrls?.size || 0,
    dependency_task_count: proof?.dependencies?.taskIds?.size || 0,
    verified_repair_alias_count: list(proof?.verifiedRepairAliases).length,
    graph_repair_alias_evidence_count:
      list(proof?.repairAliasEvidence).length,
    own_alias_verified: Boolean(ownAlias),
    issues,
    passed: issues.length === 0,
  });
}

const sourcePassedCount = verifications.filter(
  (item) => item.kind === "SOURCE" && item.passed,
).length;
const reviewPassedCount = verifications.filter(
  (item) => item.kind === "REVIEW" && item.passed,
).length;
const failedCount = verifications.filter((item) => !item.passed).length;

requireValue(
  sourcePassedCount === 9 && reviewPassedCount === 9 && failedCount === 0,
  "ONE_OR_MORE_SHOT_ISOLATION_EVIDENCE_CHECKS_FAILED",
);

const protectedIds = new Set(list(checkpoint.protected_task_ids).map(text));
const protectedStateSha = taskFingerprint(
  before.tasks.filter((task) => protectedIds.has(task.id)),
);
requireValue(
  protectedIds.size === 36 &&
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
  before.wallet_updated_at === after.wallet_updated_at;
if (!stateUnchanged) {
  blockers.push("READ_ONLY_SHOT_ISOLATION_GATE_VERIFY_CHANGED_STATE");
}

const decision = blockers.length
  ? "REPAIR_SHOT_ISOLATION_GATE_VERIFICATION_BLOCKED"
  : "REPAIR_SHOT_ISOLATION_GATE_18_REPLACEMENTS_CONFIRMED";
const readiness = blockers.length
  ? "REPAIR_SHOT_ISOLATION_GATE_VERIFICATION_BLOCKED"
  : "READY_TO_RESUME_CHECKPOINTED_REPAIR_SOURCE_DISPATCH";
const instruction = blockers.length
  ? "Resolve every isolation-gate verification blocker. Do not resume dispatch."
  : "Resume only the existing checkpointed source dispatch with the original authorization. Do not delete the checkpoint, poll providers, execute review tasks, retry, finalise, or publish.";

const report = {
  contract: REPORT_CONTRACT,
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  alias_audit_file: auditFile.absolute,
  alias_audit_file_sha256: auditFile.file_sha256,
  checkpoint_file: checkpointFile.absolute,
  checkpoint_file_sha256: checkpointFile.file_sha256,
  replacement_task_count: replacements.length,
  source_passed_count: sourcePassedCount,
  review_passed_count: reviewPassedCount,
  failed_count: failedCount,
  verifications,
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
console.log("READ-ONLY REPAIR-AWARE SHOT-ISOLATION GATE VERIFICATION");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`TASK_COUNT=${before.task_count}`);
console.log(`TASK_STATUS_COUNTS=${JSON.stringify(before.task_status_counts)}`);
console.log(`REPLACEMENT_TASK_COUNT=${replacements.length}`);
console.log(`SOURCE_PASSED_COUNT=${sourcePassedCount}`);
console.log(`REVIEW_PASSED_COUNT=${reviewPassedCount}`);
console.log(`FAILED_COUNT=${failedCount}`);
console.log(`PROTECTED_TASK_COUNT=${protectedIds.size}`);
console.log(`PROTECTED_TASK_STATE_SHA256=${protectedStateSha}`);

for (const item of verifications) {
  console.log([
    `SHOT_ISOLATION_GATE_VERIFY=${item.task_id}`,
    `kind=${item.kind || ""}`,
    `node=${item.execution_node_id || ""}`,
    `creative_assets=${item.creative_asset_count}`,
    `asset_nodes=${item.asset_node_count}`,
    `authorized_nodes=${item.authorized_production_node_count}`,
    `node_references=${item.input_production_node_reference_count}`,
    `allowed_media=${item.allowed_media_count}`,
    `dependencies=${item.dependency_task_count}`,
    `verified_aliases=${item.verified_repair_alias_count}`,
    `graph_alias_evidence=${item.graph_repair_alias_evidence_count}`,
    `own_alias=${item.own_alias_verified ? "YES" : "NO"}`,
    `issues=${item.issues.join(",")}`,
    `passed=${item.passed ? "YES" : "NO"}`,
  ].join("|"));
}

console.log(`SHOT_ISOLATION_GATE_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`SHOT_ISOLATION_GATE_DECISION=${decision}`);
console.log(`SHOT_ISOLATION_GATE_INSTRUCTION=${instruction}`);
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
