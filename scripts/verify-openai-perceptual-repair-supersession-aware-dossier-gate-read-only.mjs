#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const AUDIT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_ACTIVE_DOSSIER_TASK_SET_AUDIT_V1";
const CHECKPOINT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_CHECKPOINT_V1";
const REPORT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SUPERSESSION_AWARE_DOSSIER_GATE_VERIFICATION_V1";

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
    task_state_sha256: taskFingerprint(scopedTasks),
    usage_count: Number(usage.count || 0),
    wallet_balance: money(wallet.data?.available_balance),
    wallet_updated_at: wallet.data?.updated_at || null,
  };
}

const auditFile = readJson(process.argv[2], "ACTIVE_TASK_SET_AUDIT");
const checkpointFile = readJson(process.argv[3], "SOURCE_DISPATCH_CHECKPOINT");
const audit = object(auditFile.value);
const checkpoint = object(checkpointFile.value);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_DOSSIER_GATE_VERIFICATION_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-repair-supersession-aware-dossier-gate-verification.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("DOSSIER_GATE_VERIFICATION_SCOPE_REQUIRED");
}

const [
  { supabaseAdmin },
  { ProductionTaskRuntime },
  { CreativeProductionDossierExecutionGate },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/creative/production/dossier/runtime/CreativeProductionDossierExecutionGate"),
]);

const blockers = [];
const requireValue = (condition, label) => {
  if (!condition) blockers.push(label);
};

requireValue(text(audit.contract) === AUDIT_CONTRACT, "AUDIT_CONTRACT_INVALID");
requireValue(
  text(checkpoint.contract) === CHECKPOINT_CONTRACT,
  "CHECKPOINT_CONTRACT_INVALID",
);
requireValue(
  text(audit.organization_id) === organizationId &&
    text(audit.creative_project_id) === projectId &&
    text(audit.production_graph_id) === graphId,
  "AUDIT_SCOPE_INVALID",
);
requireValue(
  text(checkpoint.organization_id) === organizationId &&
    text(checkpoint.creative_project_id) === projectId &&
    text(checkpoint.production_graph_id) === graphId,
  "CHECKPOINT_SCOPE_INVALID",
);
requireValue(
  text(audit.decision) ===
    "REPAIR_ACTIVE_DOSSIER_TASK_SET_27_ACTIVE_TASKS_CONFIRMED" &&
    text(audit.readiness) ===
      "READY_FOR_SUPERSESSION_AWARE_DOSSIER_GATE_RUNTIME_FIX" &&
    list(audit.blockers).length === 0 &&
    audit.state_unchanged === true,
  "ACTIVE_TASK_SET_AUDIT_NOT_READY",
);
requireValue(
  Number(audit.historical_task_count) === 45 &&
    Number(audit.valid_superseded_task_count) === 18 &&
    Number(audit.invalid_supersession_count) === 0 &&
    Number(audit.active_task_count) === 27 &&
    Number(audit.graph_expected_task_count) === 27 &&
    audit.active_count_would_pass === true &&
    audit.active_cost_would_pass === true,
  "ACTIVE_TASK_SET_AUDIT_COUNTS_INVALID",
);
requireValue(
  text(checkpoint.status) === "IN_PROGRESS" &&
    list(checkpoint.source_records).length === 1,
  "CHECKPOINT_PARTIAL_STATE_INVALID",
);

const before = await exactState({
  supabaseAdmin,
  ProductionTaskRuntime,
  organizationId,
  projectId,
  graphId,
});
const taskMap = new Map(before.tasks.map((task) => [task.id, task]));
const authorizedRecord = list(checkpoint.source_records).find(
  (record) => text(record.state) === "AUTHORIZED_WAITING",
);
const authorizedTask = authorizedRecord
  ? taskMap.get(text(authorizedRecord.source_task_id))
  : null;

requireValue(Boolean(authorizedRecord), "AUTHORIZED_WAITING_RECORD_MISSING");
requireValue(Boolean(authorizedTask), "AUTHORIZED_WAITING_TASK_MISSING");
if (authorizedTask) {
  requireValue(
    text(authorizedTask.status) === "WAITING" &&
      text(authorizedTask.provider_id) === "runway" &&
      authorizedTask.cost?.approved === true &&
      money(authorizedTask.cost?.estimated) === 5.26032 &&
      authorizedTask.metadata?.dispatch_authorized === true &&
      !authorizedTask.timing?.started_at &&
      !authorizedTask.timing?.completed_at &&
      Object.keys(object(authorizedTask.output)).length === 0,
    "AUTHORIZED_WAITING_TASK_STATE_INVALID",
  );
}
requireValue(
  before.usage_count === Number(checkpoint.initial_usage_count),
  "USAGE_CHANGED_BEFORE_GATE_VERIFICATION",
);
requireValue(
  before.wallet_balance === money(checkpoint.initial_wallet_balance) &&
    before.wallet_updated_at === checkpoint.initial_wallet_updated_at,
  "WALLET_CHANGED_BEFORE_GATE_VERIFICATION",
);

let evidence = null;
if (authorizedTask && blockers.length === 0) {
  try {
    evidence = await CreativeProductionDossierExecutionGate.approvedDossier(
      authorizedTask,
    );
  } catch (error) {
    blockers.push(`DOSSIER_GATE_REJECTED:${error.message}`);
  }
}

if (evidence) {
  requireValue(
    text(evidence.mode) === "SEALED_PREPRODUCTION_GATE",
    "DOSSIER_GATE_MODE_INVALID",
  );
  requireValue(
    Number(evidence.historicalTaskCount) === 45 &&
      Number(evidence.activeTaskCount) === 27 &&
      Number(evidence.supersededTaskCount) === 18 &&
      Number(evidence.supersededSourceCount) === 9 &&
      Number(evidence.supersededReviewCount) === 9,
    "DOSSIER_GATE_TASK_SET_COUNTS_INVALID",
  );
  requireValue(
    money(evidence.plannedCost) === money(audit.active_planned_cost) &&
      money(evidence.plannedCost) === 160.998794 &&
      money(evidence.historicalPlannedCost) ===
        money(audit.historical_planned_cost) &&
      money(evidence.historicalPlannedCost) === 373.11768 &&
      money(evidence.ceiling) === 367.366602 &&
      Number(evidence.plannedCost) <= Number(evidence.ceiling),
    "DOSSIER_GATE_COST_EVIDENCE_INVALID",
  );
  requireValue(
    list(evidence.supersession).length === 18 &&
      list(evidence.supersession).every(
        (item) => item.valid === true && list(item.issues).length === 0,
      ),
    "DOSSIER_GATE_SUPERSESSION_EVIDENCE_INVALID",
  );
}

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
  blockers.push("READ_ONLY_DOSSIER_GATE_VERIFICATION_CHANGED_STATE");
}

const decision = blockers.length
  ? "SUPERSESSION_AWARE_DOSSIER_GATE_VERIFICATION_BLOCKED"
  : "SUPERSESSION_AWARE_DOSSIER_GATE_27_ACTIVE_TASKS_CONFIRMED";
const readiness = blockers.length
  ? "SUPERSESSION_AWARE_DOSSIER_GATE_VERIFICATION_BLOCKED"
  : "READY_TO_RESUME_CHECKPOINTED_REPAIR_SOURCE_DISPATCH";
const instruction = blockers.length
  ? "Resolve every dossier-gate verification blocker. Do not resume dispatch."
  : "Resume only the existing checkpointed source-dispatch workflow using the same dispatch authorization. Do not delete the checkpoint. The workflow must submit the one authorized waiting source and the remaining eight ready sources without polling or review execution.";

const report = {
  contract: REPORT_CONTRACT,
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  active_task_set_audit_file: auditFile.absolute,
  active_task_set_audit_file_sha256: auditFile.file_sha256,
  checkpoint_file: checkpointFile.absolute,
  checkpoint_file_sha256: checkpointFile.file_sha256,
  authorized_source_task_id: authorizedTask?.id || null,
  dossier_evidence: evidence
    ? {
        mode: evidence.mode,
        ceiling: money(evidence.ceiling),
        historical_task_count: Number(evidence.historicalTaskCount),
        active_task_count: Number(evidence.activeTaskCount),
        superseded_task_count: Number(evidence.supersededTaskCount),
        superseded_source_count: Number(evidence.supersededSourceCount),
        superseded_review_count: Number(evidence.supersededReviewCount),
        historical_planned_cost: money(evidence.historicalPlannedCost),
        active_planned_cost: money(evidence.plannedCost),
        supersession_count: list(evidence.supersession).length,
      }
    : null,
  blockers,
  decision,
  instruction,
  exact_state_before: {
    task_count: before.task_count,
    task_state_sha256: before.task_state_sha256,
    usage_count: before.usage_count,
    wallet_balance: before.wallet_balance,
    wallet_updated_at: before.wallet_updated_at,
  },
  exact_state_after: {
    task_count: after.task_count,
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
console.log("READ-ONLY SUPERSESSION-AWARE DOSSIER GATE VERIFICATION");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`AUTHORIZED_SOURCE_TASK_ID=${authorizedTask?.id || ""}`);
console.log(`DOSSIER_GATE_MODE=${evidence?.mode || ""}`);
console.log(`HISTORICAL_TASK_COUNT=${evidence?.historicalTaskCount ?? ""}`);
console.log(`ACTIVE_TASK_COUNT=${evidence?.activeTaskCount ?? ""}`);
console.log(`SUPERSEDED_TASK_COUNT=${evidence?.supersededTaskCount ?? ""}`);
console.log(`SUPERSEDED_SOURCE_COUNT=${evidence?.supersededSourceCount ?? ""}`);
console.log(`SUPERSEDED_REVIEW_COUNT=${evidence?.supersededReviewCount ?? ""}`);
console.log(`HISTORICAL_PLANNED_COST=${money(evidence?.historicalPlannedCost)}`);
console.log(`ACTIVE_PLANNED_COST=${money(evidence?.plannedCost)}`);
console.log(`APPROVED_CEILING=${money(evidence?.ceiling)}`);
console.log(`SUPERSESSION_EVIDENCE_COUNT=${list(evidence?.supersession).length}`);
console.log(`DOSSIER_GATE_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`DOSSIER_GATE_DECISION=${decision}`);
console.log(`DOSSIER_GATE_INSTRUCTION=${instruction}`);
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
