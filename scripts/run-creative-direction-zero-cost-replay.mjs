#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableValue(value));
}

function sameSet(left, right) {
  return JSON.stringify([...left].sort()) ===
    JSON.stringify([...right].sort());
}

function runId() {
  const current = new Date();
  const stamp = current.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  return stamp.replace("T", "-").replace("Z", "");
}

const sourceGraphId = text(
  process.env.SOURCE_PRODUCTION_GRAPH_ID ||
    process.env.PRODUCTION_GRAPH_ID ||
    process.argv[2],
);
const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.PROJECT_ID);
const sourceApprovalId = text(process.env.SOURCE_APPROVAL_ID);
const supplementApprovalId = text(process.env.SUPPLEMENT_APPROVAL_ID);
const commandIdentity = text(process.env.COMMAND_IDENTITY);

assert(Boolean(sourceGraphId), "SOURCE_PRODUCTION_GRAPH_ID_REQUIRED");
assert(Boolean(organizationId), "ORGANIZATION_ID_REQUIRED");
assert(Boolean(projectId), "PROJECT_ID_REQUIRED");
assert(Boolean(sourceApprovalId), "SOURCE_APPROVAL_ID_REQUIRED");
assert(Boolean(supplementApprovalId), "SUPPLEMENT_APPROVAL_ID_REQUIRED");
assert(Boolean(commandIdentity), "COMMAND_IDENTITY_REQUIRED");
assert(
  sourceApprovalId !== supplementApprovalId,
  "ZERO_COST_REPLAY_APPROVAL_ISOLATION_REQUIRED",
);

const identifier = runId();
const reportPath = path.resolve(
  text(process.env.REPORT) ||
    `/tmp/churchill-zero-cost-direction-replay-${identifier}.txt`,
);
const outputPath = path.resolve(
  text(process.env.OUTPUT) ||
    `/tmp/churchill-zero-cost-direction-plan-${identifier}.json`,
);

fs.writeFileSync(reportPath, "", "utf8");

function emit(value = "") {
  const line = `${value}\n`;
  process.stdout.write(line);
  fs.appendFileSync(reportPath, line, "utf8");
}

function emitChunk(chunk) {
  const value = String(chunk ?? "");
  process.stdout.write(value);
  fs.appendFileSync(reportPath, value, "utf8");
}

const [
  { supabaseAdmin },
  { UsageRuntime },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/platform/service-runtime/usage/UsageRuntime"),
]);

async function readState() {
  const [
    projectResult,
    walletResult,
    sourceGraphResult,
    graphsResult,
    tasksResult,
    usageRows,
  ] = await Promise.all([
    supabaseAdmin
      .from("creative_projects")
      .select("*")
      .eq("id", projectId)
      .eq("organization_id", organizationId)
      .single(),

    supabaseAdmin
      .from("organization_wallets")
      .select("*")
      .eq("organization_id", organizationId)
      .single(),

    supabaseAdmin
      .from("creative_production_graphs")
      .select("*")
      .eq("id", sourceGraphId)
      .single(),

    supabaseAdmin
      .from("creative_production_graphs")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("creative_project_id", projectId),

    supabaseAdmin
      .from("creative_production_tasks")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("creative_project_id", projectId),

    UsageRuntime.organization(organizationId),
  ]);

  for (const result of [
    projectResult,
    walletResult,
    sourceGraphResult,
    graphsResult,
    tasksResult,
  ]) {
    if (result.error) throw result.error;
  }

  return {
    project: projectResult.data,
    wallet: walletResult.data,
    source_graph: sourceGraphResult.data,
    graph_ids: list(graphsResult.data).map((row) => row.id).sort(),
    task_ids: list(tasksResult.data).map((row) => row.id).sort(),
    usage_ids: list(usageRows).map((row) => row.id).sort(),
  };
}

function validateCompletedApproval({
  approval,
  expectedId,
  expectedCalls,
  label,
}) {
  assert(
    approval.contract === "CREATIVE_DIRECTION_BUDGET_APPROVAL_V2",
    `${label}_APPROVAL_CONTRACT_INVALID`,
  );
  assert(
    text(approval.id) === expectedId,
    `${label}_APPROVAL_ID_INVALID:${text(approval.id)}:${expectedId}`,
  );
  assert(
    text(approval.command_identity) === commandIdentity,
    `${label}_APPROVAL_COMMAND_IDENTITY_INVALID`,
  );
  assert(
    text(approval.status).toUpperCase() === "COMPLETED",
    `${label}_APPROVAL_STATUS_INVALID:${text(approval.status)}`,
  );
  assert(
    approval.approved === false,
    `${label}_APPROVAL_APPROVED_FLAG_INVALID`,
  );
  assert(
    Number(approval.call_count) === expectedCalls &&
      Number(approval.maximum_calls) === expectedCalls,
    `${label}_APPROVAL_CALL_COUNT_INVALID:${approval.call_count}:${approval.maximum_calls}:${expectedCalls}`,
  );
  assert(
    list(approval.operations).length === expectedCalls,
    `${label}_APPROVAL_LEDGER_COUNT_INVALID:${list(approval.operations).length}:${expectedCalls}`,
  );
}

emit("============================================================");
emit("ZERO-COST DIRECTION REPLAY PREFLIGHT");
emit("============================================================");

const before = await readState();
const beforeMetadata = object(before.project.metadata);
const sourceApproval = object(
  beforeMetadata.paid_direction_replay_source,
);
const supplementApproval = object(
  beforeMetadata.paid_direction_approval,
);

assert(
  text(before.project.organization_id) === organizationId,
  "ZERO_COST_REPLAY_PROJECT_ORGANIZATION_MISMATCH",
);
assert(
  text(beforeMetadata.command_identity) === commandIdentity,
  "ZERO_COST_REPLAY_PROJECT_COMMAND_IDENTITY_MISMATCH",
);
validateCompletedApproval({
  approval: sourceApproval,
  expectedId: sourceApprovalId,
  expectedCalls: 20,
  label: "SOURCE",
});
validateCompletedApproval({
  approval: supplementApproval,
  expectedId: supplementApprovalId,
  expectedCalls: 3,
  label: "SUPPLEMENT",
});
assert(
  text(supplementApproval.source_approval_id) === sourceApprovalId,
  "SUPPLEMENT_APPROVAL_SOURCE_MISMATCH",
);

emit(`SOURCE_GRAPH_ID=${sourceGraphId}`);
emit(`ORGANIZATION_ID=${organizationId}`);
emit(`CREATIVE_PROJECT_ID=${projectId}`);
emit(`SOURCE_APPROVAL_ID=${sourceApprovalId}`);
emit(`SUPPLEMENT_APPROVAL_ID=${supplementApprovalId}`);
emit(`WALLET_BALANCE_BEFORE=${before.wallet.available_balance}`);
emit(`GRAPH_COUNT_BEFORE=${before.graph_ids.length}`);
emit(`TASK_COUNT_BEFORE=${before.task_ids.length}`);
emit(`USAGE_COUNT_BEFORE=${before.usage_ids.length}`);
emit("SETTLED_RESPONSES_TO_REPLAY=18");
emit("NEW_REASONING_CALLS_AUTHORIZED=0");
emit("MAXIMUM_ADDITIONAL_CUSTOMER_PRICE=0");
emit("PROVIDER_EXECUTION_AUTHORIZED=NO");
emit("ZERO_COST_REPLAY_PREFLIGHT=PASS");

const childEnvironment = {
  ...process.env,
  SOURCE_PRODUCTION_GRAPH_ID: sourceGraphId,
  CREATIVE_DIRECTION_OUTPUT_PATH: outputPath,
  CREATIVE_DIRECTION_COMPLETED_REPLAY_AUTHORIZED: "true",
  CREATIVE_DIRECTION_COMPLETED_REPLAY_SOURCE_APPROVAL_ID:
    sourceApprovalId,
  CREATIVE_DIRECTION_COMPLETED_REPLAY_SUPPLEMENT_APPROVAL_ID:
    supplementApprovalId,
  CREATIVE_DIRECTION_COMPLETED_REPLAY_COMMAND_IDENTITY:
    commandIdentity,
  CREATIVE_DIRECTION_RESULT_RECOVERY_DISABLED: "true",
  CREATIVE_FRESH_DIRECTION_AUTHORIZED: "true",
  CREATIVE_PROVIDER_EXECUTION_AUTHORIZED: "false",
  CREATIVE_ALLOW_AUTOMATIC_REPAIR: "false",
  CREATIVE_APPROVED_INCREMENTAL_REPAIR_BUDGET: "0",
  REPAIR_EXECUTION_AUTHORIZED: "false",
  PUBLICATION_AUTHORIZED: "false",
};

for (const obsoleteName of [
  "CREATIVE_DIRECTION_ATTEMPT_REPLAY_AUTHORIZED",
  "CREATIVE_DIRECTION_EXACT_RESUME_AUTHORIZED",
  "CREATIVE_DIRECTION_RESUME_APPROVAL_ID",
  "CREATIVE_DIRECTION_RESUME_COMMAND_IDENTITY",
]) {
  delete childEnvironment[obsoleteName];
}

emit("");
emit("============================================================");
emit("EXECUTE 18-RESULT ZERO-COST REPLAY");
emit("============================================================");
emit("PROVIDER_CALLS_EXECUTED=NO");
emit("RUNWAY_PROVIDER_CALLS_AUTHORIZED=NO");
emit("GRAPH_MATERIALIZATION_AUTHORIZED=NO");
emit("TASK_MATERIALIZATION_AUTHORIZED=NO");
emit("REPAIR_EXECUTION_AUTHORIZED=NO");
emit("PUBLICATION_AUTHORIZED=NO");

const child = spawn(
  process.execPath,
  [
    "--loader",
    "./scripts/next-alias-loader.mjs",
    "--import",
    "./scripts/creative-runtime-completed-replay-bootstrap.mjs",
    "scripts/creative-studio-fresh-direction-only.mjs",
    sourceGraphId,
  ],
  {
    cwd: process.cwd(),
    env: childEnvironment,
    stdio: ["inherit", "pipe", "pipe"],
  },
);

child.stdout.on("data", emitChunk);
child.stderr.on("data", emitChunk);

const directionExit = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("close", (code, signal) => {
    if (signal) {
      emit(`DIRECTION_PROCESS_SIGNAL=${signal}`);
      resolve(1);
      return;
    }
    resolve(Number.isInteger(code) ? code : 1);
  });
});

emit("");
emit("============================================================");
emit("POST-REPLAY FORENSIC VERIFICATION");
emit("============================================================");

const after = await readState();
const report = fs.readFileSync(reportPath, "utf8");
const replayCount = (
  report.match(/CREATIVE_DIRECTION_COMPLETED_REPLAY_RECOVERED=/g) || []
).length;
const reconciled = report.includes(
  "CREATIVE_COUNCIL_REVISION_STRUCTURE_RECONCILED=",
);
const unexpectedAdditionalCall = report.includes(
  "CREATIVE_DIRECTION_COMPLETED_REPLAY_UNEXPECTED_ADDITIONAL_CALL",
);

let output = null;
let outputParseError = null;
const outputExists = fs.existsSync(outputPath);
if (outputExists) {
  try {
    output = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  } catch (error) {
    outputParseError = text(error?.message || error);
  }
}

const scenes = list(output?.plan?.scenes);
const shotCount = scenes.reduce(
  (sum, scene) => sum + list(scene.shots).length,
  0,
);

const blockers = [];

if (directionExit !== 0) {
  blockers.push(`DIRECTION_EXECUTION_FAILED:${directionExit}`);
}
if (Number(after.wallet.available_balance) !== Number(before.wallet.available_balance)) {
  blockers.push(
    `WALLET_CHANGED:${before.wallet.available_balance}:${after.wallet.available_balance}`,
  );
}
if (
  stableJson(after.project.metadata) !==
  stableJson(before.project.metadata)
) {
  blockers.push("PROJECT_METADATA_CHANGED");
}
if (stableJson(after.source_graph) !== stableJson(before.source_graph)) {
  blockers.push("SOURCE_GRAPH_CHANGED");
}
if (!sameSet(before.graph_ids, after.graph_ids)) {
  blockers.push("GRAPH_SET_CHANGED");
}
if (!sameSet(before.task_ids, after.task_ids)) {
  blockers.push("TASK_SET_CHANGED");
}
if (!sameSet(before.usage_ids, after.usage_ids)) {
  blockers.push("USAGE_SET_CHANGED");
}
if (replayCount !== 18) {
  blockers.push(`COMPLETED_REPLAY_COUNT_INVALID:${replayCount}:18`);
}
if (!reconciled) {
  blockers.push("REVISION_STRUCTURE_RECONCILIATION_NOT_USED");
}
if (unexpectedAdditionalCall) {
  blockers.push("UNEXPECTED_NINETEENTH_REASONING_CALL_ATTEMPTED");
}
if (!outputExists) {
  blockers.push("DIRECTION_OUTPUT_MISSING");
}
if (outputParseError) {
  blockers.push(`DIRECTION_OUTPUT_JSON_INVALID:${outputParseError}`);
}
if (
  output &&
  output.contract !== "ISOLATED_FRESH_CREATIVE_DIRECTION_V1"
) {
  blockers.push("DIRECTION_OUTPUT_CONTRACT_INVALID");
}
if (output && output.plan?.validation?.passed !== true) {
  blockers.push("DIRECTION_PLAN_VALIDATION_FAILED");
}
if (output && (!scenes.length || shotCount <= 0)) {
  blockers.push("DIRECTION_SCENES_OR_SHOTS_MISSING");
}

emit(`DIRECTION_EXIT=${directionExit}`);
emit(`COMPLETED_REPLAY_COUNT=${replayCount}`);
emit(`REVISION_STRUCTURE_RECONCILED=${reconciled ? "YES" : "NO"}`);
emit(
  `UNEXPECTED_ADDITIONAL_CALL_ATTEMPTED=${
    unexpectedAdditionalCall ? "YES" : "NO"
  }`,
);
emit(`WALLET_BALANCE_BEFORE=${before.wallet.available_balance}`);
emit(`WALLET_BALANCE_AFTER=${after.wallet.available_balance}`);
emit(
  `WALLET_CHANGED=${
    Number(after.wallet.available_balance) ===
    Number(before.wallet.available_balance)
      ? "NO"
      : "YES"
  }`,
);
emit(`USAGE_COUNT_BEFORE=${before.usage_ids.length}`);
emit(`USAGE_COUNT_AFTER=${after.usage_ids.length}`);
emit(`DIRECTION_OUTPUT_EXISTS=${outputExists ? "YES" : "NO"}`);
emit(
  `PLAN_VALIDATION_PASSED=${
    output?.plan?.validation?.passed === true ? "YES" : "NO"
  }`,
);
emit(`SCENE_COUNT=${scenes.length}`);
emit(`SHOT_COUNT=${shotCount}`);
emit(`GRAPH_COUNT_BEFORE=${before.graph_ids.length}`);
emit(`GRAPH_COUNT_AFTER=${after.graph_ids.length}`);
emit(`TASK_COUNT_BEFORE=${before.task_ids.length}`);
emit(`TASK_COUNT_AFTER=${after.task_ids.length}`);
emit("NEW_REASONING_CALLS_EXECUTED=NO");
emit("PROVIDER_CALLS_EXECUTED=NO");
emit("RUNWAY_PROVIDER_CALLS_AUTHORIZED=NO");
emit("REPAIR_EXECUTION_AUTHORIZED=NO");
emit("PUBLICATION_AUTHORIZED=NO");
emit(`REPORT=${reportPath}`);
emit(`DIRECTION_OUTPUT=${outputPath}`);
emit(
  `POST_REPLAY_VERIFICATION=${blockers.length ? "FAIL" : "PASS"}`,
);
emit(`POST_REPLAY_BLOCKER_COUNT=${blockers.length}`);
emit(`POST_REPLAY_BLOCKERS=${JSON.stringify(blockers)}`);
emit("TERMINAL_REMAINS_OPEN=YES");

if (blockers.length) process.exitCode = 2;
