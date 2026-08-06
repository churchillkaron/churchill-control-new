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
  text(process.env.OPENAI_PERCEPTUAL_REVALIDATION_PREVIEW_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-revalidation-preview.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("OPENAI_PERCEPTUAL_REVALIDATION_PREVIEW_SCOPE_REQUIRED");
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
  throw new Error(`OPENAI_PERCEPTUAL_REVALIDATION_TASK_COUNT_INVALID:${graphTasks.length}`);
}
if (reviews.length !== 13) {
  throw new Error(`OPENAI_PERCEPTUAL_REVALIDATION_REVIEW_COUNT_INVALID:${reviews.length}`);
}

const results = reviews.map((task) => {
  const evaluated = CreativeGeneratedMediaPerceptualExecutionGate.validation(task);
  const evidence = object(evaluated.evidence);
  const scoreContract = object(evaluated.score_contract);
  return {
    review_task_id: task.id,
    execution_node_id: text(task.metadata?.execution_node_id || task.input?.node_id),
    source_generation_task_id: text(task.metadata?.source_generation_task_id),
    current_status: task.status,
    current_error: task.error || task.errorMessage || null,
    normalized_passed: evaluated.passed === true,
    provider_passed: evidence.passed === true,
    score_contract_complete: scoreContract.complete === true,
    score_contract_shape: scoreContract.source_shape || null,
    normalized_score_count: Number(scoreContract.normalized_field_count || 0),
    checks: evaluated.checks,
    scores: Object.fromEntries(
      [
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
      ].map((key) => [key, evidence[key] ?? null]),
    ),
    failure_count: Array.isArray(evidence.failures) ? evidence.failures.length : 0,
    repair_instruction_count: Array.isArray(evidence.repair_instructions)
      ? evidence.repair_instructions.length
      : 0,
  };
});

const after = await exactState(
  supabaseAdmin,
  organizationId,
  projectId,
  graphId,
);
const stateUnchanged = JSON.stringify(before) === JSON.stringify(after);
const passCount = results.filter((item) => item.normalized_passed).length;
const failCount = results.length - passCount;
const completeContractCount = results.filter(
  (item) => item.score_contract_complete,
).length;

const report = {
  contract: "CHURCHILL_OPENAI_PERCEPTUAL_REVALIDATION_PREVIEW_V1",
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  task_count: graphTasks.length,
  review_task_count: reviews.length,
  complete_score_contract_count: completeContractCount,
  normalized_pass_count: passCount,
  normalized_fail_count: failCount,
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
  readiness:
    stateUnchanged && completeContractCount === reviews.length
      ? "READY_FOR_RECONCILIATION_REVIEW"
      : "PREVIEW_INCOMPLETE",
};

fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("READ-ONLY OPENAI PERCEPTUAL REVIEW REVALIDATION PREVIEW");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`TASK_COUNT=${graphTasks.length}`);
console.log(`REVIEW_TASK_COUNT=${reviews.length}`);
console.log(`COMPLETE_SCORE_CONTRACT_COUNT=${completeContractCount}`);
console.log(`NORMALIZED_PASS_COUNT=${passCount}`);
console.log(`NORMALIZED_FAIL_COUNT=${failCount}`);
for (const item of results) {
  console.log([
    `REVALIDATION=${item.execution_node_id}`,
    `contract_complete=${item.score_contract_complete ? "YES" : "NO"}`,
    `shape=${item.score_contract_shape || ""}`,
    `provider_passed=${item.provider_passed ? "YES" : "NO"}`,
    `normalized_passed=${item.normalized_passed ? "YES" : "NO"}`,
    `overall=${item.scores.overall_score ?? ""}`,
    `story=${item.scores.story_score ?? ""}`,
    `camera=${item.scores.camera_score ?? ""}`,
    `identity=${item.scores.identity_score ?? ""}`,
    `product=${item.scores.product_fidelity_score ?? ""}`,
    `failures=${item.failure_count}`,
    `repairs=${item.repair_instruction_count}`,
  ].join("|"));
}
console.log(`STATE_UNCHANGED=${stateUnchanged ? "YES" : "NO"}`);
console.log(`AUDIT_READINESS=${report.readiness}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("PROVIDER_POLLS_EXECUTED=NO");
console.log("RETRIES_EXECUTED=NO");
console.log("RECONCILIATION_AUTHORIZED=NO");
console.log("FINALISATION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

if (!stateUnchanged || report.readiness === "PREVIEW_INCOMPLETE") {
  process.exitCode = 2;
}
