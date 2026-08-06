#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { loadAvantiqoEnv } from "./load-avantiqo-env.mjs";

loadAvantiqoEnv({ cwd: process.cwd() });
await import("./creative-runtime-bootstrap.mjs");

const REVIEW_CONTRACT = "GENERATED_MEDIA_PERCEPTUAL_REVIEW_V1";
const REVIEW_FAILURE = "GENERATED_MEDIA_PERCEPTUAL_VALIDATION_FAILED";
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
const BOOLEAN_KEYS = Object.freeze([
  "passed",
  "person_count_correct",
  "identity_preserved",
  "product_preserved",
  "requested_environment_correct",
  "requested_camera_correct",
  "story_contribution_present",
  "music_energy_translated",
  "anatomy_valid",
  "physics_valid",
  "continuity_valid",
  "synthetic_artifacts_absent",
  "source_background_not_copied",
  "unexpected_text_or_watermark_absent",
]);

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

function money(value) {
  return Number(Number(value || 0).toFixed(6));
}

function sortedKeys(value) {
  return Object.keys(object(value)).sort();
}

function scoreCount(value = {}) {
  return SCORE_KEYS.filter((key) => Number.isFinite(Number(value[key]))).length;
}

function booleanCount(value = {}) {
  return BOOLEAN_KEYS.filter((key) => typeof value[key] === "boolean").length;
}

function parseStructuredText(value) {
  const source = text(value).replace(/^\uFEFF/, "");
  if (!source) return null;
  const candidates = [source];
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    if (match[1]) candidates.push(match[1].trim());
  }
  const first = source.indexOf("{");
  const last = source.lastIndexOf("}");
  if (first >= 0 && last > first) {
    candidates.push(source.slice(first, last + 1));
  }
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return object(parsed.result || parsed.review || parsed.validation || parsed);
      }
    } catch {
      // Continue conservatively.
    }
  }
  return null;
}

function candidateEntries(task = {}) {
  const output = object(task.output);
  const submission = object(output.provider_submission);
  const submissionOutput = object(submission.output);
  const outputValue = object(output.output);
  const candidates = [
    ["output.perceptual_validation.evidence", object(output.perceptual_validation).evidence],
    ["output.output.output", object(outputValue.output)],
    ["output.output", outputValue],
    ["output.provider_submission.output.output", object(submissionOutput.output)],
    ["output.provider_submission.output", submissionOutput],
    ["output.provider_submission", submission],
  ];

  const textCandidates = [
    ["output.output.text", outputValue.text],
    ["output.output.output_text", outputValue.output_text],
    ["output.provider_submission.output.text", submissionOutput.text],
    ["output.provider_submission.output.output_text", submissionOutput.output_text],
  ];
  for (const [candidatePath, value] of textCandidates) {
    const parsed = parseStructuredText(value);
    if (parsed) candidates.push([`${candidatePath}:parsed`, parsed]);
  }

  return candidates
    .map(([candidatePath, value]) => ({
      path: candidatePath,
      value: object(value),
    }))
    .filter((entry) => Object.keys(entry.value).length > 0);
}

function strongestEvidence(task = {}) {
  const entries = candidateEntries(task);
  const ranked = entries
    .map((entry, index) => ({
      ...entry,
      score_count: scoreCount(entry.value),
      boolean_count: booleanCount(entry.value),
      index,
    }))
    .sort((left, right) =>
      right.score_count - left.score_count ||
      right.boolean_count - left.boolean_count ||
      left.index - right.index,
    );
  return ranked[0] || {
    path: null,
    value: {},
    score_count: 0,
    boolean_count: 0,
  };
}

function canonicalValidatorEvidence(task = {}) {
  const validation = object(task.output?.perceptual_validation);
  return {
    validation,
    evidence: object(validation.evidence),
    checks: object(validation.checks),
  };
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

function sourceTaskId(task = {}) {
  return text(
    task.metadata?.source_generation_task_id ||
    list(task.depends_on)[0],
  );
}

function executionNodeId(task = {}) {
  return text(task.metadata?.execution_node_id || task.input?.node_id);
}

function isReviewTask(task = {}) {
  return (
    text(task.metadata?.contract) === REVIEW_CONTRACT &&
    text(task.capability || task.service_code).toLowerCase() ===
      "ai.image.analyze" &&
    text(task.provider_id).toLowerCase() === "openai"
  );
}

function selectedFields(value = {}, keys = []) {
  return Object.fromEntries(keys.map((key) => [
    key,
    value[key] ?? null,
  ]));
}

function failedCheckNames(checks = {}) {
  return Object.entries(object(checks))
    .filter(([, passed]) => passed !== true)
    .map(([name]) => name)
    .sort();
}

function falseBooleanNames(evidence = {}) {
  return BOOLEAN_KEYS.filter((key) =>
    key !== "passed" && evidence[key] === false,
  );
}

function compactTextList(value, maximumItems = 12) {
  return list(value)
    .slice(0, maximumItems)
    .map((item) => text(
      typeof item === "string"
        ? item
        : item?.message || item?.reason || item?.description || JSON.stringify(item),
    ).replace(/\s+/g, " ").slice(0, 500))
    .filter(Boolean);
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
  text(process.env.OPENAI_PERCEPTUAL_DECISION_AUDIT_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-review-decision-audit.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("OPENAI_PERCEPTUAL_DECISION_AUDIT_SCOPE_REQUIRED");
}

const { supabaseAdmin } = await import("@/lib/shared/supabase/admin");
const { ProductionTaskRuntime } = await import(
  "@/lib/operations/tasks/runtime/ProductionTaskRuntime"
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
const graphTasks = tasks.filter((task) =>
  text(task.production_graph_id) === graphId,
);
const reviews = graphTasks.filter((task) =>
  task.status === "FAILED" &&
  text(task.error) === REVIEW_FAILURE &&
  isReviewTask(task),
);
const sourceById = new Map(graphTasks.map((task) => [task.id, task]));

if (graphTasks.length !== 27) {
  throw new Error(
    `OPENAI_PERCEPTUAL_DECISION_AUDIT_TASK_COUNT_INVALID:${graphTasks.length}`,
  );
}
if (reviews.length !== 13) {
  throw new Error(
    `OPENAI_PERCEPTUAL_DECISION_AUDIT_REVIEW_COUNT_INVALID:${reviews.length}`,
  );
}

const decisions = reviews.map((task) => {
  const canonical = canonicalValidatorEvidence(task);
  const strongest = strongestEvidence(task);
  const canonicalScores = scoreCount(canonical.evidence);
  const canonicalBooleans = booleanCount(canonical.evidence);
  const strongestMatchesCanonical =
    canonicalScores === strongest.score_count &&
    canonicalBooleans === strongest.boolean_count &&
    SCORE_KEYS.every((key) =>
      canonical.evidence[key] === strongest.value[key],
    ) &&
    BOOLEAN_KEYS.every((key) =>
      canonical.evidence[key] === strongest.value[key],
    );
  const sourceId = sourceTaskId(task);
  const source = sourceById.get(sourceId) || null;
  const evidence = canonical.evidence;
  const taskThresholds = thresholds(task);
  const failures = compactTextList(evidence.failures);
  const repairs = compactTextList(evidence.repair_instructions);
  const affectedTimestamps = list(evidence.affected_timestamps)
    .slice(0, 24)
    .map((value) =>
      typeof value === "number" ? value : text(value),
    );

  return {
    review_task_id: task.id,
    execution_node_id: executionNodeId(task),
    source_task_id: sourceId || null,
    source_execution_node_id: source ? executionNodeId(source) : null,
    source_status: source?.status || null,
    source_error: source?.error || null,
    canonical_evidence_path: "output.perceptual_validation.evidence",
    strongest_original_evidence_path: strongest.path,
    strongest_matches_canonical: strongestMatchesCanonical,
    canonical_score_count: canonicalScores,
    canonical_boolean_count: canonicalBooleans,
    strongest_score_count: strongest.score_count,
    strongest_boolean_count: strongest.boolean_count,
    validator_passed: canonical.validation.passed === true,
    reviewer_passed: evidence.passed === true,
    scores: selectedFields(evidence, SCORE_KEYS),
    thresholds: taskThresholds,
    checks: canonical.checks,
    failed_checks: failedCheckNames(canonical.checks),
    booleans: selectedFields(evidence, BOOLEAN_KEYS),
    false_booleans: falseBooleanNames(evidence),
    failures,
    repair_instructions: repairs,
    affected_timestamps: affectedTimestamps,
    evidence_items: compactTextList(evidence.evidence),
    analyzed_image_count:
      task.output?.output?.analyzed_image_count ??
      task.output?.provider_submission?.output?.analyzed_image_count ??
      null,
    response_status:
      task.output?.output?.response_status ??
      task.output?.provider_submission?.output?.response_status ??
      null,
    original_output_keys: sortedKeys(task.output?.output),
    provider_submission_output_keys:
      sortedKeys(task.output?.provider_submission?.output),
  };
});

const after = await exactState(
  supabaseAdmin,
  organizationId,
  projectId,
  graphId,
);
const stateUnchanged = JSON.stringify(before) === JSON.stringify(after);
const scorelessCount = decisions.filter((item) =>
  item.canonical_score_count === 0,
).length;
const incompleteScoreCount = decisions.filter((item) =>
  item.canonical_score_count > 0 &&
  item.canonical_score_count < SCORE_KEYS.length,
).length;
const extractionMismatchCount = decisions.filter((item) =>
  !item.strongest_matches_canonical,
).length;
const sevenFrameCount = decisions.filter((item) =>
  Number(item.analyzed_image_count) === 7,
).length;
const explicitReviewerRejectCount = decisions.filter((item) =>
  item.reviewer_passed === false,
).length;
const thresholdRejectCount = decisions.filter((item) =>
  item.failed_checks.length > 0,
).length;
const reasonedRejectCount = decisions.filter((item) =>
  item.failures.length > 0 || item.repair_instructions.length > 0,
).length;
const evidenceComplete =
  scorelessCount === 0 &&
  incompleteScoreCount === 0 &&
  extractionMismatchCount === 0 &&
  sevenFrameCount === 13;

const report = {
  contract: "CHURCHILL_OPENAI_PERCEPTUAL_REVIEW_DECISION_AUDIT_V1",
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  task_count: graphTasks.length,
  review_count: reviews.length,
  decision_count: decisions.length,
  scoreless_count: scorelessCount,
  incomplete_score_count: incompleteScoreCount,
  extraction_mismatch_count: extractionMismatchCount,
  seven_frame_analysis_count: sevenFrameCount,
  explicit_reviewer_reject_count: explicitReviewerRejectCount,
  threshold_reject_count: thresholdRejectCount,
  reasoned_reject_count: reasonedRejectCount,
  evidence_complete: evidenceComplete,
  decisions,
  exact_state_before: before,
  exact_state_after: after,
  state_unchanged: stateUnchanged,
  database_writes_executed: false,
  provider_calls_executed: false,
  provider_polls_executed: false,
  retries_executed: false,
  publication_authorized: false,
  readiness:
    stateUnchanged && evidenceComplete
      ? "DECISIONS_EXTRACTED"
      : "AUDIT_INCOMPLETE",
};
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("READ-ONLY OPENAI PERCEPTUAL REVIEW DECISION AUDIT");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`GRAPH_ID=${graphId}`);
console.log(`TASK_COUNT=${graphTasks.length}`);
console.log(`REVIEW_COUNT=${reviews.length}`);
console.log(`DECISION_COUNT=${decisions.length}`);
console.log(`SCORELESS_COUNT=${scorelessCount}`);
console.log(`INCOMPLETE_SCORE_COUNT=${incompleteScoreCount}`);
console.log(`EXTRACTION_MISMATCH_COUNT=${extractionMismatchCount}`);
console.log(`SEVEN_FRAME_ANALYSIS_COUNT=${sevenFrameCount}`);
console.log(`EXPLICIT_REVIEWER_REJECT_COUNT=${explicitReviewerRejectCount}`);
console.log(`THRESHOLD_REJECT_COUNT=${thresholdRejectCount}`);
console.log(`REASONED_REJECT_COUNT=${reasonedRejectCount}`);
for (const decision of decisions) {
  console.log([
    "REVIEW_DECISION",
    decision.execution_node_id,
    `source=${decision.source_execution_node_id || ""}`,
    `canonical_scores=${decision.canonical_score_count}`,
    `canonical_booleans=${decision.canonical_boolean_count}`,
    `strongest_path=${decision.strongest_original_evidence_path || ""}`,
    `extraction_match=${decision.strongest_matches_canonical ? "YES" : "NO"}`,
    `images=${decision.analyzed_image_count ?? ""}`,
    `response=${decision.response_status || ""}`,
    `reviewer_passed=${decision.reviewer_passed ? "YES" : "NO"}`,
    `validator_passed=${decision.validator_passed ? "YES" : "NO"}`,
    `failed_checks=${decision.failed_checks.join(",")}`,
    `false_booleans=${decision.false_booleans.join(",")}`,
    ...SCORE_KEYS.map((key) => `${key}=${decision.scores[key] ?? ""}`),
  ].join("|"));
  for (const failure of decision.failures) {
    console.log(`REVIEW_FAILURE_REASON=${decision.execution_node_id}|${failure}`);
  }
  for (const repair of decision.repair_instructions) {
    console.log(`REVIEW_REPAIR_INSTRUCTION=${decision.execution_node_id}|${repair}`);
  }
  if (decision.affected_timestamps.length) {
    console.log(
      `REVIEW_AFFECTED_TIMESTAMPS=${decision.execution_node_id}|${decision.affected_timestamps.join(",")}`,
    );
  }
}
console.log(`TASK_COUNT_BEFORE=${before.task_count}`);
console.log(`TASK_COUNT_AFTER=${after.task_count}`);
console.log(`USAGE_COUNT_BEFORE=${before.usage_count}`);
console.log(`USAGE_COUNT_AFTER=${after.usage_count}`);
console.log(`WALLET_BALANCE_BEFORE=${before.wallet_balance}`);
console.log(`WALLET_BALANCE_AFTER=${after.wallet_balance}`);
console.log(`STATE_UNCHANGED=${stateUnchanged ? "YES" : "NO"}`);
console.log(`AUDIT_READINESS=${report.readiness}`);
console.log("DATABASE_WRITES_EXECUTED=NO");
console.log("PROVIDER_CALLS_EXECUTED=NO");
console.log("PROVIDER_POLLS_EXECUTED=NO");
console.log("RETRIES_EXECUTED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

if (!stateUnchanged || !evidenceComplete) process.exitCode = 2;
