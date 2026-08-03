#!/usr/bin/env node

import process from "node:process";
import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function round(value) {
  return Number(finite(value).toFixed(6));
}

function usageTaskId(usage = {}) {
  return text(
    usage.task_id ||
    usage.metadata?.task_id ||
    usage.metadata?.production_task_id,
  );
}

function transactionType(transaction = {}) {
  return upper(
    transaction.type ||
    transaction.transaction_type ||
    transaction.operation,
  );
}

function transactionBelongsToUsage(transaction = {}, usageId = "") {
  const expected = text(usageId);
  if (!expected) return false;
  const identities = [
    transaction.usage_id,
    transaction.metadata?.usage_id,
    transaction.reference,
    transaction.idempotency_key,
  ].map(text).filter(Boolean);
  return identities.some((identity) =>
    identity === expected ||
    identity === `RESERVE:${expected}` ||
    identity === `CHARGE:${expected}` ||
    identity === `RELEASE:${expected}` ||
    identity === `REFUND:${expected}` ||
    identity.startsWith(`${expected}:`) ||
    identity.endsWith(`:${expected}`) ||
    identity.includes(`:${expected}:`),
  );
}

function transactionAmount(transactions = [], token = "") {
  return round(
    transactions
      .filter((transaction) => transactionType(transaction).includes(token))
      .reduce((sum, transaction) => sum + finite(transaction.amount), 0),
  );
}

function taskUsageRows(usages = [], taskId = "") {
  return usages.filter((usage) => usageTaskId(usage) === text(taskId));
}

function usageWalletState(usage, transactions) {
  const related = transactions.filter((transaction) =>
    transactionBelongsToUsage(transaction, usage.id),
  );
  const reserve = transactionAmount(related, "RESERVE");
  const charge = transactionAmount(related, "CHARGE");
  const release = transactionAmount(related, "RELEASE");
  const refund = transactionAmount(related, "REFUND");
  const open = round(Math.max(0, reserve - charge - release - refund));
  return { related, reserve, charge, release, refund, open };
}

function providerJobId(task = {}) {
  return text(
    task.output?.provider_job_id ||
    task.output?.provider_submission?.provider_job_id ||
    task.output?.provider_submission?.output?.provider_job_id ||
    task.output?.provider_submission?.output?.output?.provider_job_id,
  );
}

function usageId(task = {}) {
  return text(
    task.output?.usage?.id ||
    task.output?.provider_submission?.usage?.id ||
    task.output?.provider_poll?.usage?.id,
  );
}

function qualityEvidence(task = {}) {
  const output = object(task.output);
  const nestedOutput = object(output.output);
  const review = object(output.review);
  const validation = object(
    output.perceptual_validation ||
    nestedOutput.perceptual_validation ||
    review.perceptual_validation ||
    task.metadata?.perceptual_validation,
  );
  const evidence = object(validation.evidence);
  const directReview = object(task.review);

  const state = upper(
    task.metadata?.perceptual_quality_state ||
    output.perceptual_quality_state ||
    nestedOutput.perceptual_quality_state,
  );
  const releaseHold =
    task.metadata?.release_hold === true ||
    output.release_hold === true ||
    nestedOutput.release_hold === true;
  const repairRequired =
    task.metadata?.quality_repair_required === true ||
    output.quality_repair_required === true ||
    nestedOutput.quality_repair_required === true;
  const explicitRejected = [
    state === "QUALITY_REJECTED",
    output.passed === false,
    nestedOutput.passed === false,
    validation.passed === false,
    evidence.passed === false,
    directReview.approved === false && directReview.required === true,
    task.metadata?.automated_perceptual_validation_passed === false,
    task.metadata?.approved_for_downstream_after_perceptual_review === false,
    task.metadata?.generated_media_released_for_downstream === false,
  ].some(Boolean);

  const failures = list(
    output.failures ||
    nestedOutput.failures ||
    evidence.failures ||
    validation.failures ||
    review.issues,
  );
  const repairInstructions = list(
    output.repair_instructions ||
    nestedOutput.repair_instructions ||
    evidence.repair_instructions ||
    validation.repair_instructions,
  );

  return {
    rejected: explicitRejected || state === "QUALITY_REJECTED",
    held: releaseHold,
    repair_required: repairRequired,
    state: state || "UNSPECIFIED",
    approved: directReview.approved === true,
    score: finite(
      output.overall_score ||
      nestedOutput.overall_score ||
      evidence.overall_score ||
      validation.overall_score ||
      directReview.score,
    ),
    failures,
    repair_instructions: repairInstructions,
  };
}

function concise(value, limit = 1200) {
  return text(
    typeof value === "string" ? value : JSON.stringify(value),
  ).replace(/\s+/g, " ").slice(0, limit);
}

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const expectedTaskCount = Number(process.env.EXPECTED_TASK_COUNT || 21);

if (!organizationId || !projectId || !graphId) {
  throw new Error("POST_PRODUCTION_AUDIT_SCOPE_REQUIRED");
}

const [
  { ProductionTaskRuntime },
  { UsageRuntime },
  { WalletRepository },
] = await Promise.all([
  import("@/lib/operations/tasks/runtime/ProductionTaskRuntime"),
  import("@/lib/platform/service-runtime/usage/UsageRuntime"),
  import("@/lib/platform/service-runtime/wallet/repositories/WalletRepository"),
]);

const [tasks, organizationUsages, organizationTransactions] = await Promise.all([
  ProductionTaskRuntime.list({
    organization_id: organizationId,
    creative_project_id: projectId,
    production_graph_id: graphId,
  }),
  UsageRuntime.organization(organizationId),
  WalletRepository.transactions(organizationId),
]);

const taskIds = new Set(tasks.map((task) => text(task.id)).filter(Boolean));
const usages = organizationUsages.filter((usage) =>
  text(usage.metadata?.production_graph_id) === graphId ||
  taskIds.has(usageTaskId(usage)),
);

const completed = tasks.filter((task) => upper(task.status) === "COMPLETED");
const nonCompleted = tasks.filter((task) => upper(task.status) !== "COMPLETED");
const qualityRows = tasks
  .map((task) => ({ task, quality: qualityEvidence(task) }))
  .filter(({ quality }) =>
    quality.rejected || quality.held || quality.repair_required,
  );

const walletRows = usages.map((usage) => ({
  usage,
  task: tasks.find((task) => text(task.id) === usageTaskId(usage)) || null,
  wallet: usageWalletState(usage, organizationTransactions),
}));
const openReservations = walletRows.filter(({ wallet }) => wallet.open > 0.000001);
const releasableCandidates = openReservations.filter(({ usage, task }) =>
  ["SUCCESS", "FAILED"].includes(upper(usage.status)) &&
  (!task || upper(task.status) === "COMPLETED"),
);
const unsafeOpenReservations = openReservations.filter(({ usage, task }) =>
  !["SUCCESS", "FAILED"].includes(upper(usage.status)) ||
  (task && upper(task.status) !== "COMPLETED"),
);

const graphReserve = round(walletRows.reduce((sum, row) => sum + row.wallet.reserve, 0));
const graphCharge = round(walletRows.reduce((sum, row) => sum + row.wallet.charge, 0));
const graphRelease = round(walletRows.reduce((sum, row) => sum + row.wallet.release, 0));
const graphRefund = round(walletRows.reduce((sum, row) => sum + row.wallet.refund, 0));
const graphOpen = round(walletRows.reduce((sum, row) => sum + row.wallet.open, 0));

const allTasksComplete =
  tasks.length === expectedTaskCount &&
  completed.length === expectedTaskCount &&
  nonCompleted.length === 0;
const qualityReady = qualityRows.length === 0;
const walletReady = graphOpen <= 0.000001;
const postProductionReady = allTasksComplete && qualityReady && walletReady;

console.log("============================================================");
console.log("APPROVED PRODUCTION POST-PRODUCTION READINESS AUDIT");
console.log("============================================================");
console.log(`ORGANIZATION_ID=${organizationId}`);
console.log(`CREATIVE_PROJECT_ID=${projectId}`);
console.log(`PRODUCTION_GRAPH_ID=${graphId}`);
console.log(`TASK_TOTAL=${tasks.length}`);
console.log(`EXPECTED_TASK_COUNT=${expectedTaskCount}`);
console.log(`TASK_COMPLETED=${completed.length}`);
console.log(`TASK_NON_COMPLETED=${nonCompleted.length}`);
console.log(`ALL_TASKS_COMPLETE=${allTasksComplete ? "YES" : "NO"}`);
console.log(`GRAPH_USAGE_COUNT=${usages.length}`);
console.log(`GRAPH_WALLET_RESERVE=${graphReserve}`);
console.log(`GRAPH_WALLET_CHARGE=${graphCharge}`);
console.log(`GRAPH_WALLET_RELEASE=${graphRelease}`);
console.log(`GRAPH_WALLET_REFUND=${graphRefund}`);
console.log(`GRAPH_OPEN_RESERVATION=${graphOpen}`);
console.log(`OPEN_RESERVATION_USAGE_COUNT=${openReservations.length}`);
console.log(`SAFE_RELEASE_CANDIDATE_COUNT=${releasableCandidates.length}`);
console.log(`UNSAFE_OPEN_RESERVATION_COUNT=${unsafeOpenReservations.length}`);
console.log(`QUALITY_REJECTION_OR_HOLD_COUNT=${qualityRows.length}`);
console.log(`WALLET_READY=${walletReady ? "YES" : "NO"}`);
console.log(`QUALITY_READY=${qualityReady ? "YES" : "NO"}`);
console.log(`POST_PRODUCTION_READY=${postProductionReady ? "YES" : "NO"}`);
console.log("PUBLICATION_AUTHORIZED=NO");

for (const [index, row] of openReservations.entries()) {
  const label = `OPEN_RESERVATION_${index + 1}`;
  console.log("------------------------------------------------------------");
  console.log(`${label}_USAGE_ID=${row.usage.id || "NONE"}`);
  console.log(`${label}_USAGE_STATUS=${row.usage.status || "NONE"}`);
  console.log(`${label}_TASK_ID=${row.task?.id || usageTaskId(row.usage) || "NONE"}`);
  console.log(`${label}_TASK_STATUS=${row.task?.status || "NONE"}`);
  console.log(`${label}_TASK_TITLE=${row.task?.title || "NONE"}`);
  console.log(`${label}_PROVIDER=${row.usage.provider || row.task?.provider_id || "NONE"}`);
  console.log(`${label}_CAPABILITY=${row.usage.capability || row.usage.operation || row.task?.capability || "NONE"}`);
  console.log(`${label}_RESERVE=${row.wallet.reserve}`);
  console.log(`${label}_CHARGE=${row.wallet.charge}`);
  console.log(`${label}_RELEASE=${row.wallet.release}`);
  console.log(`${label}_REFUND=${row.wallet.refund}`);
  console.log(`${label}_OPEN=${row.wallet.open}`);
  console.log(`${label}_SAFE_RELEASE_CANDIDATE=${releasableCandidates.includes(row) ? "YES" : "NO"}`);
}

for (const [index, row] of qualityRows.entries()) {
  const label = `QUALITY_HOLD_${index + 1}`;
  console.log("------------------------------------------------------------");
  console.log(`${label}_TASK_ID=${row.task.id}`);
  console.log(`${label}_TITLE=${row.task.title || ""}`);
  console.log(`${label}_TYPE=${row.task.type || ""}`);
  console.log(`${label}_PROVIDER=${row.task.provider_id || row.task.output?.provider || "NONE"}`);
  console.log(`${label}_PROVIDER_JOB_ID=${providerJobId(row.task) || "NONE"}`);
  console.log(`${label}_USAGE_ID=${usageId(row.task) || "NONE"}`);
  console.log(`${label}_QUALITY_STATE=${row.quality.state}`);
  console.log(`${label}_REJECTED=${row.quality.rejected ? "YES" : "NO"}`);
  console.log(`${label}_RELEASE_HOLD=${row.quality.held ? "YES" : "NO"}`);
  console.log(`${label}_REPAIR_REQUIRED=${row.quality.repair_required ? "YES" : "NO"}`);
  console.log(`${label}_SCORE=${row.quality.score}`);
  console.log(`${label}_FAILURES=${concise(row.quality.failures) || "[]"}`);
  console.log(`${label}_REPAIR_INSTRUCTIONS=${concise(row.quality.repair_instructions) || "[]"}`);
}

for (const [index, task] of nonCompleted.entries()) {
  const label = `NON_COMPLETED_${index + 1}`;
  console.log("------------------------------------------------------------");
  console.log(`${label}_TASK_ID=${task.id}`);
  console.log(`${label}_TITLE=${task.title || ""}`);
  console.log(`${label}_STATUS=${task.status || ""}`);
  console.log(`${label}_ERROR=${concise(task.error || task.output?.error) || "NONE"}`);
}

console.log("============================================================");
console.log("AUDIT RESULT");
console.log("============================================================");
console.log("READ_ONLY_AUDIT=PASS");
console.log("WALLET_CHANGED=NO");
console.log("TASKS_CHANGED=NO");
console.log("FINALISATION_STARTED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
