#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const VERIFY_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SHOT_ISOLATION_GATE_VERIFICATION_V1";
const CHECKPOINT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_SOURCE_DISPATCH_CHECKPOINT_V1";
const REPORT_CONTRACT =
  "CHURCHILL_OPENAI_PERCEPTUAL_REPAIR_MATERIALIZATION_CONTRACT_ISOLATION_BOUNDARY_AUDIT_V1";
const SOURCE_CONTRACT =
  "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_SOURCE_V1";
const REVIEW_CONTRACT =
  "GENERATED_MEDIA_PERCEPTUAL_REPLACEMENT_REVIEW_V1";
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

function repairKind(task = {}) {
  const contract = text(task.metadata?.repair_payload_contract);
  if (contract === SOURCE_CONTRACT) return "SOURCE";
  if (contract === REVIEW_CONTRACT) return "REVIEW";
  return null;
}

function withoutMaterializationContract(task = {}) {
  const requirements = { ...object(task.input?.requirements) };
  delete requirements.task_materialization_contract;
  return {
    ...task,
    input: {
      ...object(task.input),
      requirements,
    },
  };
}

function collectIdentifiers(
  value,
  keyMatcher,
  output = [],
  key = "",
  currentPath = "input",
  seen = new Set(),
) {
  if (value === null || value === undefined) return output;
  if (typeof value === "string") {
    if (keyMatcher(key) && text(value)) {
      output.push({ path: currentPath, id: text(value) });
    }
    return output;
  }
  if (typeof value !== "object" || seen.has(value)) return output;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectIdentifiers(
        item,
        keyMatcher,
        output,
        key,
        `${currentPath}[${index}]`,
        seen,
      ));
    return output;
  }
  for (const [childKey, child] of Object.entries(value)) {
    if (/provider_prompt|prompt|description|instructions/i.test(childKey)) {
      continue;
    }
    collectIdentifiers(
      child,
      keyMatcher,
      output,
      childKey,
      `${currentPath}.${childKey}`,
      seen,
    );
  }
  return output;
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

const verificationFile = readJson(
  process.argv[2],
  "SHOT_ISOLATION_GATE_VERIFICATION",
);
const checkpointFile = readJson(
  process.argv[3],
  "SOURCE_DISPATCH_CHECKPOINT",
);
const verification = object(verificationFile.value);
const checkpoint = object(checkpointFile.value);

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = path.resolve(
  text(
    process.env
      .OPENAI_PERCEPTUAL_MATERIALIZATION_CONTRACT_ISOLATION_BOUNDARY_AUDIT_OUTPUT,
  ) ||
    "/tmp/churchill-openai-perceptual-repair-materialization-contract-isolation-boundary-audit.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("MATERIALIZATION_CONTRACT_BOUNDARY_AUDIT_SCOPE_REQUIRED");
}

const [
  { supabaseAdmin },
  { ProductionTaskRuntime },
  { CreativeProductionTaskMaterializationRuntime },
  { CreativeShotAssetIsolationExecutionGate },
  { CreativeShotAssetScopeRuntime },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/creative/execution/runtime/CreativeProductionTaskMaterializationRuntime"),
  import("@/lib/creative/assets/isolation/runtime/CreativeShotAssetIsolationExecutionGate"),
  import("@/lib/creative/assets/isolation/runtime/CreativeShotAssetScopeRuntime"),
]);

const blockers = [];
const requireValue = (condition, label) => {
  if (!condition) blockers.push(label);
};

requireValue(
  text(verification.contract) === VERIFY_CONTRACT,
  "VERIFICATION_CONTRACT_INVALID",
);
requireValue(
  text(checkpoint.contract) === CHECKPOINT_CONTRACT,
  "CHECKPOINT_CONTRACT_INVALID",
);
for (const [label, value] of [
  ["VERIFICATION", verification],
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
  text(verification.decision) ===
    "REPAIR_SHOT_ISOLATION_GATE_VERIFICATION_BLOCKED" &&
    text(verification.readiness) ===
      "REPAIR_SHOT_ISOLATION_GATE_VERIFICATION_BLOCKED" &&
    Number(verification.replacement_task_count) === 18 &&
    Number(verification.source_passed_count) === 7 &&
    Number(verification.review_passed_count) === 9 &&
    Number(verification.failed_count) === 2 &&
    list(verification.blockers).length === 1 &&
    verification.blockers[0] ===
      "ONE_OR_MORE_SHOT_ISOLATION_EVIDENCE_CHECKS_FAILED" &&
    verification.state_unchanged === true,
  "FAILED_VERIFICATION_SHAPE_INVALID",
);
requireValue(
  text(checkpoint.status) === "IN_PROGRESS" &&
    list(checkpoint.source_records).length === 1 &&
    Number(checkpoint.initial_task_count) === 45 &&
    Number(checkpoint.initial_usage_count) === 2658 &&
    money(checkpoint.initial_wallet_balance) === 9300.972022,
  "CHECKPOINT_STATE_INVALID",
);

const failedVerificationItems = list(verification.verifications).filter(
  (item) => item.passed !== true,
);
requireValue(
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
    ),
  "FAILED_ITEMS_NOT_CONTRACT_INTERNAL_ONLY",
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

const audits = [];
for (const task of replacements) {
  const issues = [];
  const contract = object(
    task.input?.requirements?.task_materialization_contract,
  );
  const contractValid =
    CreativeProductionTaskMaterializationRuntime.verify(contract);
  const contractNodeMatches =
    text(contract.node_id) === text(task.metadata?.execution_node_id);

  const contractAssetNodeRefs = collectIdentifiers(
    contract,
    CreativeShotAssetScopeRuntime.assetNodeKey,
    [],
    "task_materialization_contract",
    "input.requirements.task_materialization_contract",
  );
  const transportTask = withoutMaterializationContract(task);
  const transportAssetNodeRefs = collectIdentifiers(
    transportTask.input,
    CreativeShotAssetScopeRuntime.assetNodeKey,
  );

  let proof = null;
  try {
    proof = await CreativeShotAssetIsolationExecutionGate.evidence(
      transportTask,
    );
  } catch (error) {
    issues.push(`TRANSPORT_VIEW_EVIDENCE_FAILED:${error.message}`);
  }

  const ownNodeId = text(task.metadata?.execution_node_id);
  const ownAlias = list(proof?.verifiedRepairAliases).find(
    (alias) => text(alias.replacement_node_id) === ownNodeId,
  );

  if (!contractValid) issues.push("MATERIALIZATION_CONTRACT_INVALID");
  if (!contractNodeMatches) issues.push("MATERIALIZATION_NODE_MISMATCH");
  if (proof && !ownAlias) issues.push("OWN_REPAIR_ALIAS_NOT_VERIFIED");
  if (proof && list(proof.repairAliasEvidence).length !== 18) {
    issues.push("GRAPH_REPAIR_ALIAS_EVIDENCE_COUNT_INVALID");
  }

  const originallyFailed = FAILED_SOURCE_IDS.has(text(task.id));
  if (originallyFailed) {
    if (contractAssetNodeRefs.length === 0) {
      issues.push("EXPECTED_CONTRACT_INTERNAL_ASSET_NODE_REFS_MISSING");
    }
    if (transportAssetNodeRefs.length !== 0) {
      issues.push("LIVE_TRANSPORT_ASSET_NODE_REFS_PRESENT");
    }
  }

  audits.push({
    task_id: task.id,
    kind: repairKind(task),
    originally_failed: originallyFailed,
    materialization_contract_valid: contractValid,
    materialization_node_matches: contractNodeMatches,
    contract_asset_node_reference_count: contractAssetNodeRefs.length,
    contract_asset_node_unique_count: new Set(
      contractAssetNodeRefs.map((entry) => entry.id),
    ).size,
    transport_asset_node_reference_count: transportAssetNodeRefs.length,
    transport_asset_node_unique_count: new Set(
      transportAssetNodeRefs.map((entry) => entry.id),
    ).size,
    creative_asset_count: proof?.creativeIds?.size || 0,
    scoped_asset_node_count: proof?.assetNodeIds?.size || 0,
    authorized_production_node_count: proof?.productionNodeIds?.size || 0,
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

const sourcePassedCount = audits.filter(
  (item) => item.kind === "SOURCE" && item.passed,
).length;
const reviewPassedCount = audits.filter(
  (item) => item.kind === "REVIEW" && item.passed,
).length;
const failedCount = audits.filter((item) => !item.passed).length;
const boundaryConfirmedCount = audits.filter(
  (item) =>
    item.originally_failed &&
    item.materialization_contract_valid &&
    item.contract_asset_node_reference_count > 0 &&
    item.transport_asset_node_reference_count === 0 &&
    item.passed,
).length;

requireValue(
  sourcePassedCount === 9 &&
    reviewPassedCount === 9 &&
    failedCount === 0 &&
    boundaryConfirmedCount === 2,
  "MATERIALIZATION_CONTRACT_BOUNDARY_NOT_CONFIRMED",
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
  blockers.push("READ_ONLY_BOUNDARY_AUDIT_CHANGED_STATE");
}

const decision = blockers.length
  ? "MATERIALIZATION_CONTRACT_ISOLATION_BOUNDARY_AUDIT_BLOCKED"
  : "MATERIALIZATION_CONTRACT_ISOLATION_BOUNDARY_2_FALSE_POSITIVES_CONFIRMED";
const readiness = blockers.length
  ? "MATERIALIZATION_CONTRACT_ISOLATION_BOUNDARY_AUDIT_BLOCKED"
  : "READY_TO_EXCLUDE_VERIFIED_MATERIALIZATION_CONTRACT_FROM_LIVE_INPUT_SCAN";
const instruction = blockers.length
  ? "Resolve every boundary-audit blocker. Do not resume dispatch."
  : "Update only the shot-isolation input scanners to ignore the verified task_materialization_contract descriptor subtree. Continue validating the contract hash separately and continue scanning all actual provider input, scopes, dependencies, URLs and repair aliases. Then rerun the read-only isolation verification before dispatch resume.";

const report = {
  contract: REPORT_CONTRACT,
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  verification_file: verificationFile.absolute,
  verification_file_sha256: verificationFile.file_sha256,
  checkpoint_file: checkpointFile.absolute,
  checkpoint_file_sha256: checkpointFile.file_sha256,
  failed_verification_count: failedVerificationItems.length,
  failed_source_task_ids: failedVerificationItems.map((item) => item.task_id),
  replacement_task_count: replacements.length,
  source_passed_count: sourcePassedCount,
  review_passed_count: reviewPassedCount,
  failed_count: failedCount,
  boundary_confirmed_count: boundaryConfirmedCount,
  audits,
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
console.log("READ-ONLY MATERIALIZATION-CONTRACT ISOLATION BOUNDARY AUDIT");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`FAILED_VERIFICATION_COUNT=${failedVerificationItems.length}`);
console.log(
  `FAILED_SOURCE_TASK_IDS=${failedVerificationItems
    .map((item) => item.task_id)
    .join(",")}`,
);
console.log(`REPLACEMENT_TASK_COUNT=${replacements.length}`);
console.log(`SOURCE_PASSED_COUNT=${sourcePassedCount}`);
console.log(`REVIEW_PASSED_COUNT=${reviewPassedCount}`);
console.log(`FAILED_COUNT=${failedCount}`);
console.log(`BOUNDARY_CONFIRMED_COUNT=${boundaryConfirmedCount}`);
console.log(`PROTECTED_TASK_COUNT=${protectedIds.size}`);
console.log(`PROTECTED_TASK_STATE_SHA256=${protectedStateSha}`);

for (const item of audits) {
  console.log([
    `MATERIALIZATION_BOUNDARY=${item.task_id}`,
    `kind=${item.kind || ""}`,
    `originally_failed=${item.originally_failed ? "YES" : "NO"}`,
    `contract_valid=${item.materialization_contract_valid ? "YES" : "NO"}`,
    `node_match=${item.materialization_node_matches ? "YES" : "NO"}`,
    `contract_asset_node_refs=${item.contract_asset_node_reference_count}`,
    `contract_asset_node_unique=${item.contract_asset_node_unique_count}`,
    `transport_asset_node_refs=${item.transport_asset_node_reference_count}`,
    `transport_asset_node_unique=${item.transport_asset_node_unique_count}`,
    `own_alias=${item.own_alias_verified ? "YES" : "NO"}`,
    `issues=${item.issues.join(",")}`,
    `passed=${item.passed ? "YES" : "NO"}`,
  ].join("|"));
}

console.log(`BOUNDARY_AUDIT_BLOCKERS=${JSON.stringify(blockers)}`);
console.log(`BOUNDARY_AUDIT_DECISION=${decision}`);
console.log(`BOUNDARY_AUDIT_INSTRUCTION=${instruction}`);
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
