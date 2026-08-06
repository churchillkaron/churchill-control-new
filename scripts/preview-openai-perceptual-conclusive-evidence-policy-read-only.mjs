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

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(object(value), key);
}

function expectation(task = {}) {
  return object(
    task.input?.requirements?.expected_contract ||
      task.metadata?.requirements?.expected_contract,
  );
}

function evidenceDecision({
  evidence,
  key,
  required,
  conclusive,
  scoreBacked,
}) {
  if (!required) {
    return {
      passed: true,
      source: "NOT_REQUIRED",
      present: hasOwn(evidence, key),
      explicit_value:
        typeof evidence[key] === "boolean" ? evidence[key] : null,
    };
  }

  if (evidence[key] === false) {
    return {
      passed: false,
      source: "EXPLICIT_FALSE",
      present: true,
      explicit_value: false,
    };
  }

  if (evidence[key] === true) {
    return {
      passed: true,
      source: "EXPLICIT_TRUE",
      present: true,
      explicit_value: true,
    };
  }

  if (conclusive && scoreBacked) {
    return {
      passed: true,
      source: "SCORE_BACKED_CONCLUSIVE_PROVIDER_VERDICT",
      present: false,
      explicit_value: null,
    };
  }

  return {
    passed: false,
    source: "MISSING_WITHOUT_CONCLUSIVE_SUPPORT",
    present: false,
    explicit_value: null,
  };
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
  text(process.env.OPENAI_PERCEPTUAL_EVIDENCE_POLICY_PREVIEW_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-evidence-policy-preview.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("OPENAI_PERCEPTUAL_EVIDENCE_POLICY_PREVIEW_SCOPE_REQUIRED");
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
    `OPENAI_PERCEPTUAL_EVIDENCE_POLICY_TASK_COUNT_INVALID:${graphTasks.length}`,
  );
}
if (reviews.length !== 13) {
  throw new Error(
    `OPENAI_PERCEPTUAL_EVIDENCE_POLICY_REVIEW_COUNT_INVALID:${reviews.length}`,
  );
}

const results = reviews.map((task) => {
  const evaluated = CreativeGeneratedMediaPerceptualExecutionGate.validation(task);
  const evidence = object(evaluated.evidence);
  const checks = object(evaluated.checks);
  const expected = expectation(task);
  const failures = Array.isArray(evidence.failures) ? evidence.failures : [];
  const repairs = Array.isArray(evidence.repair_instructions)
    ? evidence.repair_instructions
    : [];
  const providerPassed = evidence.passed === true;
  const allChecksPassed = Object.values(checks).every(Boolean);
  const conclusive =
    providerPassed &&
    allChecksPassed &&
    failures.length === 0 &&
    repairs.length === 0;

  const decisions = {
    requested_environment_correct: evidenceDecision({
      evidence,
      key: "requested_environment_correct",
      required: true,
      conclusive,
      scoreBacked: checks.environment === true,
    }),
    requested_camera_correct: evidenceDecision({
      evidence,
      key: "requested_camera_correct",
      required: true,
      conclusive,
      scoreBacked: checks.camera === true,
    }),
    story_contribution_present: evidenceDecision({
      evidence,
      key: "story_contribution_present",
      required: true,
      conclusive,
      scoreBacked: checks.story === true,
    }),
    anatomy_valid: evidenceDecision({
      evidence,
      key: "anatomy_valid",
      required: true,
      conclusive,
      scoreBacked: checks.anatomy === true,
    }),
    physics_valid: evidenceDecision({
      evidence,
      key: "physics_valid",
      required: true,
      conclusive,
      scoreBacked: checks.physics === true,
    }),
    continuity_valid: evidenceDecision({
      evidence,
      key: "continuity_valid",
      required: true,
      conclusive,
      scoreBacked: checks.continuity === true,
    }),
    synthetic_artifacts_absent: evidenceDecision({
      evidence,
      key: "synthetic_artifacts_absent",
      required: true,
      conclusive,
      scoreBacked: checks.artifacts === true,
    }),
    source_background_not_copied: evidenceDecision({
      evidence,
      key: "source_background_not_copied",
      required: true,
      conclusive,
      scoreBacked: checks.artifacts === true,
    }),
    unexpected_text_or_watermark_absent: evidenceDecision({
      evidence,
      key: "unexpected_text_or_watermark_absent",
      required: true,
      conclusive,
      scoreBacked: checks.artifacts === true,
    }),
    person_count_correct: evidenceDecision({
      evidence,
      key: "person_count_correct",
      required: expected.person_expected === true,
      conclusive,
      scoreBacked:
        checks.anatomy === true && checks.performance === true,
    }),
    identity_preserved: evidenceDecision({
      evidence,
      key: "identity_preserved",
      required: expected.identity_expected === true,
      conclusive,
      scoreBacked: checks.identity === true,
    }),
    product_preserved: evidenceDecision({
      evidence,
      key: "product_preserved",
      required: expected.product_expected === true,
      conclusive,
      scoreBacked: checks.product === true,
    }),
    music_energy_translated: evidenceDecision({
      evidence,
      key: "music_energy_translated",
      required: expected.music_expected === true,
      conclusive,
      scoreBacked: checks.music === true,
    }),
  };

  const failedEvidence = Object.entries(decisions)
    .filter(([, decision]) => decision.passed !== true)
    .map(([key]) => key)
    .sort();
  const scoreBackedEvidence = Object.entries(decisions)
    .filter(
      ([, decision]) =>
        decision.source === "SCORE_BACKED_CONCLUSIVE_PROVIDER_VERDICT",
    )
    .map(([key]) => key)
    .sort();
  const policyPassed =
    conclusive &&
    failedEvidence.length === 0;

  return {
    review_task_id: task.id,
    execution_node_id: text(
      task.metadata?.execution_node_id || task.input?.node_id,
    ),
    provider_passed: providerPassed,
    current_gate_passed: evaluated.passed === true,
    policy_passed: policyPassed,
    conclusive_provider_verdict: conclusive,
    all_score_and_frame_checks_passed: allChecksPassed,
    failed_checks: Object.entries(checks)
      .filter(([, passed]) => passed !== true)
      .map(([key]) => key)
      .sort(),
    failed_evidence: failedEvidence,
    score_backed_evidence: scoreBackedEvidence,
    evidence_decisions: decisions,
    failure_count: failures.length,
    repair_instruction_count: repairs.length,
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
const policyPassResults = results.filter((item) => item.policy_passed);
const policyFailResults = results.filter((item) => !item.policy_passed);
const providerPassRecovered = providerPassResults.every(
  (item) => item.policy_passed,
);
const providerFailContained = providerFailResults.every(
  (item) => !item.policy_passed,
);

let decision = "EVIDENCE_POLICY_PREVIEW_INCOMPLETE";
let repairInstruction =
  "Do not change the runtime gate or reconcile task state until the preview is conclusive.";
let readiness = "PREVIEW_INCOMPLETE";

if (
  stateUnchanged &&
  providerPassResults.length === 4 &&
  providerFailResults.length === 9 &&
  policyPassResults.length === 4 &&
  policyFailResults.length === 9 &&
  providerPassRecovered &&
  providerFailContained
) {
  decision = "CONCLUSIVE_SCORE_BACKED_EVIDENCE_POLICY_CONFIRMED";
  repairInstruction =
    "Update the runtime gate so explicit false evidence always fails, explicit true evidence passes, and omitted detail evidence is accepted only under a conclusive provider verdict with a complete score contract, all applicable score and frame checks passing, and zero failures or repair instructions. Then run another read-only preview before reconciling stored tasks.";
  readiness = "READY_FOR_GATE_POLICY_REPAIR";
}

const report = {
  contract: "CHURCHILL_OPENAI_PERCEPTUAL_EVIDENCE_POLICY_PREVIEW_V1",
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  task_count: graphTasks.length,
  review_task_count: reviews.length,
  provider_pass_count: providerPassResults.length,
  provider_fail_count: providerFailResults.length,
  policy_pass_count: policyPassResults.length,
  policy_fail_count: policyFailResults.length,
  provider_pass_recovered: providerPassRecovered,
  provider_fail_contained: providerFailContained,
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
console.log("READ-ONLY OPENAI PERCEPTUAL EVIDENCE-POLICY PREVIEW");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`TASK_COUNT=${graphTasks.length}`);
console.log(`REVIEW_TASK_COUNT=${reviews.length}`);
console.log(`PROVIDER_PASS_COUNT=${providerPassResults.length}`);
console.log(`PROVIDER_FAIL_COUNT=${providerFailResults.length}`);
console.log(`POLICY_PASS_COUNT=${policyPassResults.length}`);
console.log(`POLICY_FAIL_COUNT=${policyFailResults.length}`);
console.log(`PROVIDER_PASS_RECOVERED=${providerPassRecovered ? "YES" : "NO"}`);
console.log(`PROVIDER_FAIL_CONTAINED=${providerFailContained ? "YES" : "NO"}`);

for (const item of results) {
  console.log([
    `EVIDENCE_POLICY=${item.execution_node_id}`,
    `provider_passed=${item.provider_passed ? "YES" : "NO"}`,
    `current_gate_passed=${item.current_gate_passed ? "YES" : "NO"}`,
    `conclusive=${item.conclusive_provider_verdict ? "YES" : "NO"}`,
    `policy_passed=${item.policy_passed ? "YES" : "NO"}`,
    `failed_checks=${item.failed_checks.join(",")}`,
    `failed_evidence=${item.failed_evidence.join(",")}`,
    `score_backed_evidence=${item.score_backed_evidence.join(",")}`,
    `failures=${item.failure_count}`,
    `repairs=${item.repair_instruction_count}`,
  ].join("|"));
}

console.log(`EVIDENCE_POLICY_DECISION=${decision}`);
console.log(`EVIDENCE_POLICY_REPAIR_INSTRUCTION=${repairInstruction}`);
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

if (!stateUnchanged || readiness === "PREVIEW_INCOMPLETE") {
  process.exitCode = 2;
}
