#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const ALIAS_AUDIT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SHOT_ISOLATION_ALIAS_AUDIT_V1";
const GATE_VERIFY_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SHOT_ISOLATION_GATE_VERIFICATION_V1";
const BOUNDARY_V1_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_MATERIALIZATION_CONTRACT_ISOLATION_BOUNDARY_AUDIT_V1";
const CHECKPOINT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_CHECKPOINT_V1";
const REPORT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_MATERIALIZATION_CONTRACT_ISOLATION_BOUNDARY_AUDIT_V2";
const FAILED_SOURCE_IDS = new Set([
  "44620775-9937-5ada-890f-d153f510eae0",
  "694bc538-3da1-590d-ba1b-4a9c53b64fba",
]);

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

const aliasAuditFile = readJson(
  process.argv[2],
  "SHOT_ISOLATION_ALIAS_AUDIT",
);
const gateVerificationFile = readJson(
  process.argv[3],
  "SHOT_ISOLATION_GATE_VERIFICATION",
);
const boundaryV1File = readJson(
  process.argv[4],
  "MATERIALIZATION_CONTRACT_BOUNDARY_AUDIT_V1",
);
const checkpointFile = readJson(
  process.argv[5],
  "SOURCE_DISPATCH_CHECKPOINT",
);

const aliasAudit = object(aliasAuditFile.value);
const gateVerification = object(gateVerificationFile.value);
const boundaryV1 = object(boundaryV1File.value);
const checkpoint = object(checkpointFile.value);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = path.resolve(
  text(
    process.env
      .OPENAI_PERCEPTUAL_MATERIALIZATION_CONTRACT_ISOLATION_BOUNDARY_AUDIT_V2_OUTPUT,
  ) ||
    "/tmp/churchill-openai-perceptual-repair-materialization-contract-isolation-boundary-audit-v2.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("MATERIALIZATION_CONTRACT_BOUNDARY_V2_SCOPE_REQUIRED");
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
  text(aliasAudit.contract) === ALIAS_AUDIT_CONTRACT,
  "ALIAS_AUDIT_CONTRACT_INVALID",
);
requireValue(
  text(gateVerification.contract) === GATE_VERIFY_CONTRACT,
  "GATE_VERIFICATION_CONTRACT_INVALID",
);
requireValue(
  text(boundaryV1.contract) === BOUNDARY_V1_CONTRACT,
  "BOUNDARY_V1_CONTRACT_INVALID",
);
requireValue(
  text(checkpoint.contract) === CHECKPOINT_CONTRACT,
  "CHECKPOINT_CONTRACT_INVALID",
);

for (const [label, value] of [
  ["ALIAS_AUDIT", aliasAudit],
  ["GATE_VERIFICATION", gateVerification],
  ["BOUNDARY_V1", boundaryV1],
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
  Number(aliasAudit.replacement_task_count) === 18 &&
    Number(aliasAudit.valid_alias_count) === 18 &&
    Number(aliasAudit.invalid_alias_count) === 0 &&
    Number(aliasAudit.source_alias_count) === 9 &&
    Number(aliasAudit.review_alias_count) === 9 &&
    Number(aliasAudit.source_isolation_ready_count) === 9 &&
    Number(aliasAudit.review_isolation_ready_count) === 9 &&
    Number(aliasAudit.failed_isolation_audit_count) === 0 &&
    list(aliasAudit.aliases).length === 18 &&
    list(aliasAudit.aliases).every(
      (item) => item.valid === true && list(item.issues).length === 0,
    ),
  "GRAPH_ALIAS_PROOF_INVALID",
);

const failedVerificationItems = list(gateVerification.verifications).filter(
  (item) => item.passed !== true,
);
requireValue(
  text(gateVerification.decision) ===
    "REPAIR_SHOT_ISOLATION_GATE_VERIFICATION_BLOCKED" &&
    Number(gateVerification.replacement_task_count) === 18 &&
    Number(gateVerification.source_passed_count) === 7 &&
    Number(gateVerification.review_passed_count) === 9 &&
    Number(gateVerification.failed_count) === 2 &&
    failedVerificationItems.length === 2 &&
    failedVerificationItems.every((item) =>
      FAILED_SOURCE_IDS.has(text(item.task_id)),
    ) &&
    failedVerificationItems.every(
      (item) =>
        text(item.kind) === "SOURCE" &&
        list(item.issues).length === 1 &&
        text(item.issues[0]).startsWith(
          "UNSCOPED_ASSET_NODE_BLOCKED:input.requirements.task_materialization_contract.",
        ),
    ) &&
    gateVerification.state_unchanged === true,
  "CONTRACT_ONLY_FAILURE_PROOF_INVALID",
);

const boundaryAudits = list(boundaryV1.audits);
const boundaryFailedItems = boundaryAudits.filter(
  (item) => item.passed !== true,
);
requireValue(
  text(boundaryV1.decision) ===
    "MATERIALIZATION_CONTRACT_ISOLATION_BOUNDARY_AUDIT_BLOCKED" &&
    Number(boundaryV1.replacement_task_count) === 18 &&
    Number(boundaryV1.source_passed_count) === 0 &&
    Number(boundaryV1.review_passed_count) === 0 &&
    Number(boundaryV1.failed_count) === 18 &&
    Number(boundaryV1.boundary_confirmed_count) === 0 &&
    boundaryAudits.length === 18 &&
    boundaryFailedItems.length === 18 &&
    boundaryFailedItems.every(
      (item) =>
        item.materialization_contract_valid === true &&
        item.materialization_node_matches === true &&
        Number(item.graph_repair_alias_evidence_count) === 18 &&
        list(item.issues).length === 1 &&
        item.issues[0] === "OWN_REPAIR_ALIAS_NOT_VERIFIED",
    ) &&
    boundaryV1.state_unchanged === true,
  "BOUNDARY_V1_SEMANTIC_FAILURE_SHAPE_INVALID",
);

const correctedAudits = boundaryAudits.map((item) => {
  const graphAlias = list(aliasAudit.aliases).find(
    (alias) => text(alias.task_id) === text(item.task_id),
  );
  const originallyFailed = FAILED_SOURCE_IDS.has(text(item.task_id));
  const contractOnlyBoundary = Boolean(
    originallyFailed &&
      Number(item.contract_asset_node_reference_count) > 0 &&
      Number(item.contract_asset_node_unique_count) === 4 &&
      Number(item.transport_asset_node_reference_count) === 0 &&
      Number(item.transport_asset_node_unique_count) === 0,
  );
  const issues = [];

  if (!graphAlias || graphAlias.valid !== true) {
    issues.push("GRAPH_ALIAS_NOT_VALIDATED");
  }
  if (item.materialization_contract_valid !== true) {
    issues.push("MATERIALIZATION_CONTRACT_INVALID");
  }
  if (item.materialization_node_matches !== true) {
    issues.push("MATERIALIZATION_NODE_MISMATCH");
  }
  if (Number(item.graph_repair_alias_evidence_count) !== 18) {
    issues.push("GRAPH_ALIAS_EVIDENCE_COUNT_INVALID");
  }
  if (originallyFailed && !contractOnlyBoundary) {
    issues.push("CONTRACT_ONLY_BOUNDARY_NOT_PROVEN");
  }

  return {
    task_id: item.task_id,
    kind: item.kind,
    originally_failed: originallyFailed,
    graph_alias_valid: Boolean(graphAlias?.valid),
    graph_alias_original_node_id: graphAlias?.original_node_id || null,
    graph_alias_replacement_node_id: graphAlias?.replacement_node_id || null,
    materialization_contract_valid:
      item.materialization_contract_valid === true,
    materialization_node_matches:
      item.materialization_node_matches === true,
    contract_asset_node_reference_count:
      Number(item.contract_asset_node_reference_count || 0),
    contract_asset_node_unique_count:
      Number(item.contract_asset_node_unique_count || 0),
    transport_asset_node_reference_count:
      Number(item.transport_asset_node_reference_count || 0),
    transport_asset_node_unique_count:
      Number(item.transport_asset_node_unique_count || 0),
    graph_repair_alias_evidence_count:
      Number(item.graph_repair_alias_evidence_count || 0),
    contract_only_boundary_confirmed: contractOnlyBoundary,
    issues,
    passed: issues.length === 0,
  };
});

const sourcePassedCount = correctedAudits.filter(
  (item) => item.kind === "SOURCE" && item.passed,
).length;
const reviewPassedCount = correctedAudits.filter(
  (item) => item.kind === "REVIEW" && item.passed,
).length;
const failedCount = correctedAudits.filter((item) => !item.passed).length;
const boundaryConfirmedCount = correctedAudits.filter(
  (item) => item.contract_only_boundary_confirmed && item.passed,
).length;

requireValue(
  sourcePassedCount === 9 &&
    reviewPassedCount === 9 &&
    failedCount === 0 &&
    boundaryConfirmedCount === 2,
  "CORRECTED_BOUNDARY_NOT_CONFIRMED",
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
  blockers.push("READ_ONLY_BOUNDARY_V2_AUDIT_CHANGED_STATE");
}

const decision = blockers.length
  ? "MATERIALIZATION_CONTRACT_ISOLATION_BOUNDARY_V2_AUDIT_BLOCKED"
  : "MATERIALIZATION_CONTRACT_ISOLATION_BOUNDARY_2_FALSE_POSITIVES_CONFIRMED";
const readiness = blockers.length
  ? "MATERIALIZATION_CONTRACT_ISOLATION_BOUNDARY_V2_AUDIT_BLOCKED"
  : "READY_TO_EXCLUDE_VERIFIED_MATERIALIZATION_CONTRACT_FROM_LIVE_INPUT_SCAN";
const instruction = blockers.length
  ? "Resolve every corrected boundary-audit blocker. Do not resume dispatch."
  : "Update only the shot-isolation live-input scanners to skip the separately verified task_materialization_contract descriptor subtree. Continue validating the contract hash, live provider input, scopes, assets, URLs, dependencies and repair aliases. Then rerun isolation verification before dispatch resume.";

const report = {
  contract: REPORT_CONTRACT,
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  alias_audit_file: aliasAuditFile.absolute,
  alias_audit_file_sha256: aliasAuditFile.file_sha256,
  gate_verification_file: gateVerificationFile.absolute,
  gate_verification_file_sha256: gateVerificationFile.file_sha256,
  boundary_v1_file: boundaryV1File.absolute,
  boundary_v1_file_sha256: boundaryV1File.file_sha256,
  checkpoint_file: checkpointFile.absolute,
  checkpoint_file_sha256: checkpointFile.file_sha256,
  graph_alias_count: list(aliasAudit.aliases).length,
  contract_only_failed_verification_count: failedVerificationItems.length,
  replacement_task_count: correctedAudits.length,
  source_passed_count: sourcePassedCount,
  review_passed_count: reviewPassedCount,
  failed_count: failedCount,
  boundary_confirmed_count: boundaryConfirmedCount,
  corrected_audits: correctedAudits,
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
console.log("READ-ONLY CORRECTED MATERIALIZATION-CONTRACT BOUNDARY AUDIT");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`GRAPH_ALIAS_COUNT=${list(aliasAudit.aliases).length}`);
console.log(
  `CONTRACT_ONLY_FAILED_VERIFICATION_COUNT=${failedVerificationItems.length}`,
);
console.log(`REPLACEMENT_TASK_COUNT=${correctedAudits.length}`);
console.log(`SOURCE_PASSED_COUNT=${sourcePassedCount}`);
console.log(`REVIEW_PASSED_COUNT=${reviewPassedCount}`);
console.log(`FAILED_COUNT=${failedCount}`);
console.log(`BOUNDARY_CONFIRMED_COUNT=${boundaryConfirmedCount}`);
console.log(`PROTECTED_TASK_COUNT=${protectedIds.size}`);
console.log(`PROTECTED_TASK_STATE_SHA256=${protectedStateSha}`);

for (const item of correctedAudits) {
  console.log([
    `CORRECTED_BOUNDARY=${item.task_id}`,
    `kind=${item.kind || ""}`,
    `originally_failed=${item.originally_failed ? "YES" : "NO"}`,
    `graph_alias=${item.graph_alias_valid ? "PASS" : "FAIL"}`,
    `contract_valid=${item.materialization_contract_valid ? "YES" : "NO"}`,
    `node_match=${item.materialization_node_matches ? "YES" : "NO"}`,
    `contract_asset_node_refs=${item.contract_asset_node_reference_count}`,
    `contract_asset_node_unique=${item.contract_asset_node_unique_count}`,
    `transport_asset_node_refs=${item.transport_asset_node_reference_count}`,
    `transport_asset_node_unique=${item.transport_asset_node_unique_count}`,
    `contract_only_boundary=${
      item.contract_only_boundary_confirmed ? "YES" : "NO"
    }`,
    `issues=${item.issues.join(",")}`,
    `passed=${item.passed ? "YES" : "NO"}`,
  ].join("|"));
}

console.log(`BOUNDARY_V2_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`BOUNDARY_V2_DECISION=${decision}`);
console.log(`BOUNDARY_V2_INSTRUCTION=${instruction}`);
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
