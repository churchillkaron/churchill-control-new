#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const CONTRACT = "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1";
const FAILURE = "GENERATED_MEDIA_PERCEPTUAL_VALIDATION_FAILED";
const SCORE_KEYS = Object.freeze([
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
]);
const EVIDENCE_BOOLEAN_KEYS = Object.freeze([
  "passed",
  "requested_environment_correct",
  "requested_camera_correct",
  "story_contribution_present",
  "anatomy_valid",
  "physics_valid",
  "continuity_valid",
  "synthetic_artifacts_absent",
  "source_background_not_copied",
  "unexpected_text_or_watermark_absent",
  "person_count_correct",
  "identity_preserved",
  "product_preserved",
  "music_energy_translated",
]);

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

function valueType(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function expectation(task = {}) {
  return object(
    task.input?.requirements?.expected_contract ||
      task.metadata?.requirements?.expected_contract,
  );
}

function thresholds(task = {}) {
  return {
    ...object(expectation(task).thresholds),
    ...object(task.input?.requirements?.thresholds),
    ...object(task.metadata?.thresholds),
  };
}

function booleanChecks(evidence = {}, expected = {}) {
  return {
    provider_passed: evidence.passed === true,
    requested_environment_correct:
      evidence.requested_environment_correct !== false,
    requested_camera_correct: evidence.requested_camera_correct !== false,
    story_contribution_present:
      evidence.story_contribution_present !== false,
    anatomy_valid: evidence.anatomy_valid !== false,
    physics_valid: evidence.physics_valid !== false,
    continuity_valid: evidence.continuity_valid !== false,
    synthetic_artifacts_absent:
      evidence.synthetic_artifacts_absent !== false,
    source_background_not_copied:
      evidence.source_background_not_copied !== false,
    unexpected_text_or_watermark_absent:
      evidence.unexpected_text_or_watermark_absent !== false,
    person_count_correct: expected.person_expected
      ? evidence.person_count_correct !== false
      : true,
    identity_preserved: expected.identity_expected
      ? evidence.identity_preserved === true
      : true,
    product_preserved: expected.product_expected
      ? evidence.product_preserved === true
      : true,
    music_energy_translated: expected.music_expected
      ? evidence.music_energy_translated !== false
      : true,
  };
}

function relevantEvidenceFields(expected = {}) {
  const fields = [
    "passed",
    "requested_environment_correct",
    "requested_camera_correct",
    "story_contribution_present",
    "anatomy_valid",
    "physics_valid",
    "continuity_valid",
    "synthetic_artifacts_absent",
    "source_background_not_copied",
    "unexpected_text_or_watermark_absent",
  ];
  if (expected.person_expected) fields.push("person_count_correct");
  if (expected.identity_expected) fields.push("identity_preserved");
  if (expected.product_expected) fields.push("product_preserved");
  if (expected.music_expected) fields.push("music_energy_translated");
  return fields;
}

function evidenceFieldDescriptors(evidence = {}, expected = {}) {
  const relevant = new Set(relevantEvidenceFields(expected));
  return Object.fromEntries(
    EVIDENCE_BOOLEAN_KEYS.map((key) => [
      key,
      {
        relevant: relevant.has(key),
        present: hasOwn(evidence, key),
        type: valueType(evidence[key]),
        value:
          typeof evidence[key] === "boolean" ? evidence[key] : null,
      },
    ]),
  );
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
  text(process.env.OPENAI_PERCEPTUAL_REVALIDATION_DIAGNOSTIC_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-revalidation-diagnostic.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("OPENAI_PERCEPTUAL_REVALIDATION_DIAGNOSTIC_SCOPE_REQUIRED");
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
    `OPENAI_PERCEPTUAL_REVALIDATION_DIAGNOSTIC_TASK_COUNT_INVALID:${graphTasks.length}`,
  );
}
if (reviews.length !== 13) {
  throw new Error(
    `OPENAI_PERCEPTUAL_REVALIDATION_DIAGNOSTIC_REVIEW_COUNT_INVALID:${reviews.length}`,
  );
}

const results = reviews.map((task) => {
  const evaluated = CreativeGeneratedMediaPerceptualExecutionGate.validation(task);
  const evidence = object(evaluated.evidence);
  const expected = expectation(task);
  const minimum = thresholds(task);
  const scoreContract = object(evaluated.score_contract);
  const scoreChecks = object(evaluated.checks);
  const namedBooleanChecks = booleanChecks(evidence, expected);
  const evidenceFields = evidenceFieldDescriptors(evidence, expected);
  const falseScoreChecks = Object.entries(scoreChecks)
    .filter(([, passed]) => passed !== true)
    .map(([name]) => name)
    .sort();
  const falseBooleanChecks = Object.entries(namedBooleanChecks)
    .filter(([, passed]) => passed !== true)
    .map(([name]) => name)
    .sort();
  const missingRelevantEvidenceFields = Object.entries(evidenceFields)
    .filter(([, descriptor]) => descriptor.relevant && !descriptor.present)
    .map(([name]) => name)
    .sort();

  let classification = "NORMALIZED_PASS";
  if (evaluated.passed !== true) {
    if (falseScoreChecks.length > 0 && falseBooleanChecks.length > 0) {
      classification = "SCORE_AND_BOOLEAN_FAILURE";
    } else if (falseScoreChecks.length > 0) {
      classification = "SCORE_OR_FRAME_FAILURE";
    } else if (falseBooleanChecks.length > 0) {
      classification = "BOOLEAN_EVIDENCE_FAILURE";
    } else {
      classification = "UNEXPLAINED_VALIDATION_FAILURE";
    }
  }

  return {
    review_task_id: task.id,
    execution_node_id: text(
      task.metadata?.execution_node_id || task.input?.node_id,
    ),
    normalized_passed: evaluated.passed === true,
    provider_passed: evidence.passed === true,
    score_contract_complete: scoreContract.complete === true,
    score_contract_shape: scoreContract.source_shape || null,
    classification,
    false_score_checks: falseScoreChecks,
    false_boolean_checks: falseBooleanChecks,
    missing_relevant_evidence_fields: missingRelevantEvidenceFields,
    expected_flags: {
      person_expected: expected.person_expected === true,
      identity_expected: expected.identity_expected === true,
      product_expected: expected.product_expected === true,
      music_expected: expected.music_expected === true,
      media_kind: text(expected.media_kind || task.metadata?.media_kind),
    },
    evidence_fields: evidenceFields,
    analyzed_image_count: evidence.analyzed_image_count ?? null,
    thresholds: minimum,
    scores: Object.fromEntries(
      SCORE_KEYS.map((key) => [key, evidence[key] ?? null]),
    ),
    failure_count: Array.isArray(evidence.failures)
      ? evidence.failures.length
      : 0,
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
const providerPassResults = results.filter((item) => item.provider_passed);
const providerPassBlockedResults = providerPassResults.filter(
  (item) => !item.normalized_passed,
);
const allContractsComplete = results.every(
  (item) => item.score_contract_complete,
);
const allProviderPassBlocksExplained = providerPassBlockedResults.every(
  (item) =>
    item.false_score_checks.length + item.false_boolean_checks.length > 0,
);

const failureConditionCounts = {};
for (const item of results) {
  for (const condition of [
    ...item.false_score_checks.map((name) => `check:${name}`),
    ...item.false_boolean_checks.map((name) => `evidence:${name}`),
  ]) {
    failureConditionCounts[condition] =
      Number(failureConditionCounts[condition] || 0) + 1;
  }
}

let decision = "DIAGNOSTIC_INCOMPLETE";
let repairInstruction =
  "Do not reconcile stored reviews until every provider-approved disagreement is explained.";
let readiness = "DIAGNOSTIC_INCOMPLETE";

if (
  stateUnchanged &&
  allContractsComplete &&
  allProviderPassBlocksExplained
) {
  decision = "REVALIDATION_FAILURE_CONDITIONS_IDENTIFIED";
  repairInstruction =
    "Use the named failed checks to decide whether the gate contract is too strict, the provider response omitted required evidence, or the stored review genuinely fails. Do not infer missing identity, product or person preservation evidence without an explicit policy decision.";
  readiness = "READY_FOR_VALIDATION_POLICY_REVIEW";
}

const report = {
  contract: "CHURCHILL_OPENAI_PERCEPTUAL_REVALIDATION_DIAGNOSTIC_V1",
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  task_count: graphTasks.length,
  review_task_count: reviews.length,
  provider_pass_count: providerPassResults.length,
  normalized_pass_count: results.filter((item) => item.normalized_passed).length,
  provider_pass_blocked_count: providerPassBlockedResults.length,
  all_score_contracts_complete: allContractsComplete,
  failure_condition_counts: failureConditionCounts,
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
console.log("READ-ONLY OPENAI PERCEPTUAL REVALIDATION FAILURE DIAGNOSTIC");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`TASK_COUNT=${graphTasks.length}`);
console.log(`REVIEW_TASK_COUNT=${reviews.length}`);
console.log(`PROVIDER_PASS_COUNT=${providerPassResults.length}`);
console.log(
  `NORMALIZED_PASS_COUNT=${results.filter((item) => item.normalized_passed).length}`,
);
console.log(`PROVIDER_PASS_BLOCKED_COUNT=${providerPassBlockedResults.length}`);
console.log(`ALL_SCORE_CONTRACTS_COMPLETE=${allContractsComplete ? "YES" : "NO"}`);
console.log(
  `FAILURE_CONDITION_COUNTS=${JSON.stringify(failureConditionCounts)}`,
);

for (const item of results) {
  console.log([
    `VALIDATION_DIAGNOSTIC=${item.execution_node_id}`,
    `provider_passed=${item.provider_passed ? "YES" : "NO"}`,
    `normalized_passed=${item.normalized_passed ? "YES" : "NO"}`,
    `classification=${item.classification}`,
    `false_score_checks=${item.false_score_checks.join(",")}`,
    `false_boolean_checks=${item.false_boolean_checks.join(",")}`,
    `missing_relevant_evidence=${item.missing_relevant_evidence_fields.join(",")}`,
    `person_expected=${item.expected_flags.person_expected ? "YES" : "NO"}`,
    `identity_expected=${item.expected_flags.identity_expected ? "YES" : "NO"}`,
    `product_expected=${item.expected_flags.product_expected ? "YES" : "NO"}`,
    `music_expected=${item.expected_flags.music_expected ? "YES" : "NO"}`,
    `frames=${item.analyzed_image_count ?? ""}`,
    `failures=${item.failure_count}`,
    `repairs=${item.repair_instruction_count}`,
  ].join("|"));

  if (item.provider_passed && !item.normalized_passed) {
    for (const key of relevantEvidenceFields(item.expected_flags)) {
      const field = item.evidence_fields[key];
      console.log([
        `PROVIDER_PASS_EVIDENCE=${item.execution_node_id}`,
        `field=${key}`,
        `relevant=${field?.relevant ? "YES" : "NO"}`,
        `present=${field?.present ? "YES" : "NO"}`,
        `type=${field?.type || "undefined"}`,
        `value=${field?.value ?? ""}`,
      ].join("|"));
    }
  }
}

console.log(`VALIDATION_DIAGNOSTIC_DECISION=${decision}`);
console.log(`VALIDATION_DIAGNOSTIC_REPAIR_INSTRUCTION=${repairInstruction}`);
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

if (!stateUnchanged || readiness === "DIAGNOSTIC_INCOMPLETE") {
  process.exitCode = 2;
}
