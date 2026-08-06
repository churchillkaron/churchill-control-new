#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const CONTRACT = "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1";
const FAILURE = "GENERATED_MEDIA_PERCEPTUAL_VALIDATION_FAILED";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function money(value) {
  return Number(Number(value || 0).toFixed(6));
}

async function exactState(supabaseAdmin, organizationId, projectId, graphId) {
  const [tasks, usage, wallet] = await Promise.all([
    supabaseAdmin
      .from("creative_production_tasks")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("creative_project_id", projectId)
      .eq("production_graph_id", graphId),
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
  for (const result of [tasks, usage, wallet]) {
    if (result.error) throw result.error;
  }
  return {
    task_count: Number(tasks.count || 0),
    usage_count: Number(usage.count || 0),
    wallet_balance: money(wallet.data?.available_balance),
    wallet_currency: text(wallet.data?.currency) || "THB",
    wallet_updated_at: wallet.data?.updated_at || null,
  };
}

const organizationId = text(process.env.ORGANIZATION_ID);
const projectId = text(process.env.CREATIVE_PROJECT_ID);
const graphId = text(process.env.PRODUCTION_GRAPH_ID);
const outputPath = path.resolve(
  text(process.env.OPENAI_PERCEPTUAL_RUNTIME_POLICY_VERIFY_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-runtime-policy-verify.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("OPENAI_PERCEPTUAL_RUNTIME_POLICY_VERIFY_SCOPE_REQUIRED");
}

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const { ProductionTaskRuntime } = await import(
  "@/lib/operations/tasks/runtime/ProductionTaskRuntime"
);
const { CreativeGeneratedMediaPerceptualExecutionGate } = await import(
  "@/lib/creative/quality/runtime/CreativeGeneratedMediaPerceptualExecutionGate"
);

const before = await exactState(
  supabaseAdmin,
  organizationId,
  projectId,
  graphId,
);
const tasks = await ProductionTaskRuntime.list({
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
});
const graphTasks = tasks.filter(
  (task) => text(task.production_graph_id) === graphId,
);
const reviews = graphTasks.filter(
  (task) =>
    text(task.metadata?.contract) === CONTRACT &&
    text(task.provider_id).toLowerCase() === "openai" &&
    text(task.capability || task.service_code).toLowerCase() ===
      "ai.image.analyze" &&
    text(task.status).toUpperCase() === "FAILED" &&
    text(task.error || task.errorMessage) === FAILURE,
);

if (graphTasks.length !== 27) {
  throw new Error(
    `OPENAI_PERCEPTUAL_RUNTIME_POLICY_TASK_COUNT_INVALID:${graphTasks.length}`,
  );
}
if (reviews.length !== 13) {
  throw new Error(
    `OPENAI_PERCEPTUAL_RUNTIME_POLICY_REVIEW_COUNT_INVALID:${reviews.length}`,
  );
}

const results = reviews.map((task) => {
  const evaluated = CreativeGeneratedMediaPerceptualExecutionGate.validation(task);
  const evidence = object(evaluated.evidence);
  const policy = object(evaluated.evidence_policy);
  const decisions = object(policy.decisions);
  const failedChecks = Object.entries(object(evaluated.checks))
    .filter(([, passed]) => passed !== true)
    .map(([name]) => name)
    .sort();
  const failedEvidence = Object.entries(object(evaluated.evidence_checks))
    .filter(([, passed]) => passed !== true)
    .map(([name]) => name)
    .sort();
  const scoreBackedEvidence = Object.entries(decisions)
    .filter(([, decision]) =>
      decision?.source === "SCORE_BACKED_CONCLUSIVE_PROVIDER_VERDICT"
    )
    .map(([name]) => name)
    .sort();
  return {
    review_task_id: task.id,
    execution_node_id: text(
      task.metadata?.execution_node_id || task.input?.node_id,
    ),
    provider_passed: evidence.passed === true,
    runtime_passed: evaluated.passed === true,
    conclusive_provider_verdict:
      policy.conclusive_provider_verdict === true,
    score_contract_complete:
      object(evaluated.score_contract).complete === true,
    failed_checks: failedChecks,
    failed_evidence: failedEvidence,
    score_backed_evidence: scoreBackedEvidence,
    failure_count: Number(policy.failure_count || 0),
    repair_instruction_count:
      Number(policy.repair_instruction_count || 0),
  };
});

const after = await exactState(
  supabaseAdmin,
  organizationId,
  projectId,
  graphId,
);
const stateUnchanged = JSON.stringify(before) === JSON.stringify(after);
const providerPassResults = results.filter((item) => item.provider_passed);
const providerFailResults = results.filter((item) => !item.provider_passed);
const runtimePassResults = results.filter((item) => item.runtime_passed);
const runtimeFailResults = results.filter((item) => !item.runtime_passed);
const passSetMatches =
  providerPassResults.length === runtimePassResults.length &&
  providerPassResults.every((item) =>
    runtimePassResults.some(
      (candidate) => candidate.review_task_id === item.review_task_id,
    )
  );
const failSetMatches =
  providerFailResults.length === runtimeFailResults.length &&
  providerFailResults.every((item) =>
    runtimeFailResults.some(
      (candidate) => candidate.review_task_id === item.review_task_id,
    )
  );
const recoveredPassesConclusive = runtimePassResults.every(
  (item) =>
    item.conclusive_provider_verdict &&
    item.score_contract_complete &&
    item.failed_checks.length === 0 &&
    item.failed_evidence.length === 0 &&
    item.failure_count === 0 &&
    item.repair_instruction_count === 0,
);
const rejectedReviewsContained = runtimeFailResults.every(
  (item) => !item.provider_passed,
);

let decision = "RUNTIME_POLICY_VERIFY_INCOMPLETE";
let readiness = "VERIFY_INCOMPLETE";
let repairInstruction =
  "Do not reconcile stored reviews until the runtime pass and fail sets exactly match the proven policy preview.";

if (
  stateUnchanged &&
  providerPassResults.length === 4 &&
  providerFailResults.length === 9 &&
  runtimePassResults.length === 4 &&
  runtimeFailResults.length === 9 &&
  passSetMatches &&
  failSetMatches &&
  recoveredPassesConclusive &&
  rejectedReviewsContained
) {
  decision = "RUNTIME_POLICY_4_PASS_9_FAIL_CONFIRMED";
  readiness = "READY_FOR_TARGETED_RECONCILIATION_DESIGN";
  repairInstruction =
    "Design a separate targeted reconciliation that updates only the four proven runtime-pass review/source pairs, keeps the nine rejected pairs failed, performs no provider calls or source regeneration, and verifies exact before/after task state before allowing downstream continuation.";
}

const report = {
  contract: "CHURCHILL_OPENAI_PERCEPTUAL_RUNTIME_POLICY_VERIFY_V1",
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  task_count: graphTasks.length,
  review_task_count: reviews.length,
  provider_pass_count: providerPassResults.length,
  provider_fail_count: providerFailResults.length,
  runtime_pass_count: runtimePassResults.length,
  runtime_fail_count: runtimeFailResults.length,
  pass_set_matches: passSetMatches,
  fail_set_matches: failSetMatches,
  recovered_passes_conclusive: recoveredPassesConclusive,
  rejected_reviews_contained: rejectedReviewsContained,
  decision,
  repair_instruction: repairInstruction,
  results,
  exact_state_before: before,
  exact_state_after: after,
  state_unchanged: stateUnchanged,
  database_writes_executed: false,
  provider_calls_executed: false,
  provider_polls_executed: false,
  retries_executed: false,
  reconciliation_authorized: false,
  finalisation_authorized: false,
  publication_authorized: false,
  readiness,
};

fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("READ-ONLY OPENAI PERCEPTUAL RUNTIME-POLICY VERIFICATION");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`TASK_COUNT=${graphTasks.length}`);
console.log(`REVIEW_TASK_COUNT=${reviews.length}`);
console.log(`PROVIDER_PASS_COUNT=${providerPassResults.length}`);
console.log(`PROVIDER_FAIL_COUNT=${providerFailResults.length}`);
console.log(`RUNTIME_PASS_COUNT=${runtimePassResults.length}`);
console.log(`RUNTIME_FAIL_COUNT=${runtimeFailResults.length}`);
console.log(`PASS_SET_MATCHES=${passSetMatches ? "YES" : "NO"}`);
console.log(`FAIL_SET_MATCHES=${failSetMatches ? "YES" : "NO"}`);
console.log(
  `RECOVERED_PASSES_CONCLUSIVE=${recoveredPassesConclusive ? "YES" : "NO"}`,
);
console.log(
  `REJECTED_REVIEWS_CONTAINED=${rejectedReviewsContained ? "YES" : "NO"}`,
);
for (const item of results) {
  console.log([
    `RUNTIME_POLICY=${item.execution_node_id}`,
    `provider_passed=${item.provider_passed ? "YES" : "NO"}`,
    `runtime_passed=${item.runtime_passed ? "YES" : "NO"}`,
    `conclusive=${item.conclusive_provider_verdict ? "YES" : "NO"}`,
    `contract_complete=${item.score_contract_complete ? "YES" : "NO"}`,
    `failed_checks=${item.failed_checks.join(",")}`,
    `failed_evidence=${item.failed_evidence.join(",")}`,
    `score_backed_evidence=${item.score_backed_evidence.join(",")}`,
    `failures=${item.failure_count}`,
    `repairs=${item.repair_instruction_count}`,
  ].join("|"));
}
console.log(`RUNTIME_POLICY_DECISION=${decision}`);
console.log(`RUNTIME_POLICY_REPAIR_INSTRUCTION=${repairInstruction}`);
console.log(`TASK_COUNT_BEFORE=${before.task_count}`);
console.log(`TASK_COUNT_AFTER=${after.task_count}`);
console.log(`USAGE_COUNT_BEFORE=${before.usage_count}`);
console.log(`USAGE_COUNT_AFTER=${after.usage_count}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet_balance}`);
console.log(`STATE_UNCHANGED=${stateUnchanged ? "YES" : "NO"}`);
console.log(`AUDIT_READINESS=${readiness}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("PROVIDER_POLLS_EXECUTED=NO");
console.log("RETRIES_EXECUTED=NO");
console.log("RECONCILIATION_AUTHORIZED=NO");
console.log("FINALISATION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

if (!stateUnchanged || readiness === "VERIFY_INCOMPLETE") {
  process.exitCode = 2;
}
