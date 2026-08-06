#!/usr/bin/env node

import crypto from "node:crypto";
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

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter((item) => item !== undefined) : [];
}

function text(value) {
  return String(value ?? "").trim();
}

function money(value) {
  return Number(Number(value || 0).toFixed(6));
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function valueType(value) {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function finiteNumber(value) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeToken(value) {
  const source = text(value);
  return source.length <= 96 && /^[A-Za-z0-9_.:/ -]+$/.test(source)
    ? source
    : null;
}

function scalarDescriptor(value) {
  const type = valueType(value);
  if (type === "number") {
    return { type, value: Number.isFinite(value) ? value : null };
  }
  if (type === "boolean") return { type, value };
  if (type === "null" || type === "undefined") return { type };
  if (type === "string") {
    const token = safeToken(value);
    return {
      type,
      length: String(value).length,
      sha256: hash(String(value)),
      ...(token ? { token } : {}),
    };
  }
  if (type === "array") return { type, length: value.length };
  return { type, keys: Object.keys(object(value)).sort() };
}

function parseStructuredText(value) {
  const source = text(value).replace(/^\uFEFF/, "");
  if (!source || /^(?:data:|https?:\/\/)/i.test(source)) return [];

  const candidates = [];
  const add = (candidate) => {
    const normalized = text(candidate);
    if (normalized && !candidates.includes(normalized)) candidates.push(normalized);
  };

  add(source);
  for (const match of source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    add(match[1]);
  }
  const firstObject = source.indexOf("{");
  const lastObject = source.lastIndexOf("}");
  if (firstObject >= 0 && lastObject > firstObject) {
    add(source.slice(firstObject, lastObject + 1));
  }

  const parsed = [];
  for (const candidate of candidates) {
    try {
      const valueObject = JSON.parse(candidate);
      if (valueObject && typeof valueObject === "object") {
        parsed.push(valueObject);
      }
    } catch {
      // Continue conservatively.
    }
  }
  return parsed;
}

function payloadCandidates(task = {}) {
  const output = object(task.output);
  const submission = object(output.provider_submission);
  const submissionOutput = object(submission.output);
  const outputOutput = object(output.output);
  const usage = object(output.usage);
  const billing = object(output.billing);
  const billingLine = object(billing.line);
  const billingUsage = object(billing.usage);

  const directCandidates = [
    ["output.output.output", outputOutput.output],
    ["output.output", outputOutput],
    ["output.provider_submission.output.output", submissionOutput.output],
    ["output.provider_submission.output", submissionOutput],
    ["output.usage.metadata.result.output", usage.metadata?.result?.output],
    ["output.billing.line.metadata.result.output", billingLine.metadata?.result?.output],
    ["output.billing.usage.metadata.result.output", billingUsage.metadata?.result?.output],
  ];

  const candidates = [];
  for (const [candidatePath, rawValue] of directCandidates) {
    const value = rawValue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const candidate = object(value.result || value.review || value.validation || value);
      if (Object.keys(candidate).length) {
        candidates.push({ path: candidatePath, value: candidate, source: "object" });
      }
    }

    const textValues = [
      value?.text,
      value?.output_text,
      value?.raw?.output_text,
      ...list(value?.raw?.output).flatMap((item) =>
        list(item?.content).map((content) => content?.text),
      ),
    ];
    for (const [index, textValue] of textValues.entries()) {
      for (const [parsedIndex, parsed] of parseStructuredText(textValue).entries()) {
        const candidate = object(
          parsed.result || parsed.review || parsed.validation || parsed,
        );
        if (Object.keys(candidate).length) {
          candidates.push({
            path: `${candidatePath}:text${index + 1}:parsed${parsedIndex + 1}`,
            value: candidate,
            source: "parsed_text",
          });
        }
      }
    }
  }

  const unique = new Map();
  for (const candidate of candidates) {
    const signature = hash(JSON.stringify(candidate.value));
    if (!unique.has(signature)) {
      unique.set(signature, { ...candidate, signature });
    }
  }
  return [...unique.values()];
}

function scoreContainer(payload = {}) {
  if (Object.prototype.hasOwnProperty.call(payload, "scores")) {
    return { path_suffix: ".scores", value: payload.scores };
  }
  return { path_suffix: "", value: payload };
}

function inspectCandidate(candidate) {
  const container = scoreContainer(candidate.value);
  const scores = object(container.value);
  const scoreFields = {};
  let numericScoreCount = 0;
  let nonnumericPresentCount = 0;

  for (const key of SCORE_KEYS) {
    const present = Object.prototype.hasOwnProperty.call(scores, key);
    const rawValue = present ? scores[key] : undefined;
    const numeric = finiteNumber(rawValue);
    if (numeric !== null) numericScoreCount += 1;
    else if (present) nonnumericPresentCount += 1;
    scoreFields[key] = {
      present,
      numeric_value: numeric,
      descriptor: scalarDescriptor(rawValue),
    };
  }

  const unexpectedScoreKeys = Object.keys(scores)
    .filter((key) => !SCORE_KEYS.includes(key))
    .sort();
  const scoreContainerType = valueType(container.value);
  const missingScoreKeys = SCORE_KEYS.filter(
    (key) => !scoreFields[key].present,
  );

  let classification = "COMPLETE_NUMERIC_SCORE_CONTRACT";
  if (scoreContainerType !== "object") {
    classification = "SCORE_CONTAINER_NOT_OBJECT";
  } else if (Object.keys(scores).length === 0) {
    classification = "SCORE_OBJECT_EMPTY";
  } else if (numericScoreCount === 0 && nonnumericPresentCount > 0) {
    const descriptors = SCORE_KEYS
      .filter((key) => scoreFields[key].present)
      .map((key) => scoreFields[key].descriptor.type);
    classification = descriptors.every((type) => type === "null")
      ? "SCORE_VALUES_ALL_NULL"
      : "SCORE_VALUES_NON_NUMERIC";
  } else if (numericScoreCount < SCORE_KEYS.length) {
    classification = missingScoreKeys.length > 0
      ? "SCORE_KEYS_MISSING"
      : "SCORE_VALUES_PARTIALLY_NON_NUMERIC";
  }

  return {
    payload_path: candidate.path,
    payload_source: candidate.source,
    payload_signature: candidate.signature,
    payload_keys: Object.keys(candidate.value).sort(),
    passed: scalarDescriptor(candidate.value.passed),
    score_container_path: `${candidate.path}${container.path_suffix}`,
    score_container_type: scoreContainerType,
    score_container_keys: Object.keys(scores).sort(),
    numeric_score_count: numericScoreCount,
    nonnumeric_present_score_count: nonnumericPresentCount,
    missing_score_keys: missingScoreKeys,
    unexpected_score_keys: unexpectedScoreKeys,
    score_fields: scoreFields,
    failure_count: list(candidate.value.failures).length,
    repair_instruction_count: list(candidate.value.repair_instructions).length,
    evidence_count: list(candidate.value.evidence).length,
    affected_timestamp_count: list(candidate.value.affected_timestamps).length,
    classification,
  };
}

function rankInspection(left, right) {
  return (
    right.numeric_score_count - left.numeric_score_count ||
    Number(right.score_container_type === "object") -
      Number(left.score_container_type === "object") ||
    right.score_container_keys.length - left.score_container_keys.length ||
    Number(right.payload_source === "object") -
      Number(left.payload_source === "object") ||
    left.payload_path.localeCompare(right.payload_path)
  );
}

function sourceTaskId(task = {}) {
  return text(
    task.metadata?.source_generation_task_id || list(task.depends_on)[0],
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
  text(process.env.OPENAI_PERCEPTUAL_SCORE_CONTRACT_AUDIT_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-review-score-contract-audit.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("OPENAI_PERCEPTUAL_SCORE_CONTRACT_AUDIT_SCOPE_REQUIRED");
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
const graphTasks = tasks.filter(
  (task) => text(task.production_graph_id) === graphId,
);
const reviews = graphTasks.filter((task) =>
  text(task.status).toUpperCase() === "FAILED" &&
  text(task.error || task.errorMessage) === REVIEW_FAILURE &&
  isReviewTask(task),
);
const sourceById = new Map(graphTasks.map((task) => [task.id, task]));

if (graphTasks.length !== 27) {
  throw new Error(
    `OPENAI_PERCEPTUAL_SCORE_CONTRACT_AUDIT_TASK_COUNT_INVALID:${graphTasks.length}`,
  );
}
if (reviews.length !== 13) {
  throw new Error(
    `OPENAI_PERCEPTUAL_SCORE_CONTRACT_AUDIT_REVIEW_COUNT_INVALID:${reviews.length}`,
  );
}

const reviewContracts = reviews.map((task) => {
  const candidates = payloadCandidates(task);
  const inspections = candidates.map(inspectCandidate).sort(rankInspection);
  const strongest = inspections[0] || null;
  const sourceId = sourceTaskId(task);
  const source = sourceById.get(sourceId) || null;
  return {
    review_task_id: task.id,
    execution_node_id: executionNodeId(task),
    source_task_id: sourceId || null,
    source_execution_node_id: source ? executionNodeId(source) : null,
    source_status: source?.status || null,
    candidate_count: inspections.length,
    strongest,
    alternate_classifications: [...new Set(
      inspections.slice(1).map((inspection) => inspection.classification),
    )].sort(),
    all_candidate_paths: inspections.map((inspection) => inspection.payload_path),
  };
});

const after = await exactState(
  supabaseAdmin,
  organizationId,
  projectId,
  graphId,
);
const stateUnchanged = JSON.stringify(before) === JSON.stringify(after);
const completeNumericCount = reviewContracts.filter(
  (item) => item.strongest?.classification === "COMPLETE_NUMERIC_SCORE_CONTRACT",
).length;
const unresolvedContracts = reviewContracts.filter(
  (item) => item.strongest?.classification !== "COMPLETE_NUMERIC_SCORE_CONTRACT",
);
const unresolvedCount = unresolvedContracts.length;
const unresolvedClassifications = Object.fromEntries(
  [...new Set(unresolvedContracts.map(
    (item) => item.strongest?.classification || "PAYLOAD_MISSING",
  ))].sort().map((classification) => [
    classification,
    unresolvedContracts.filter(
      (item) =>
        (item.strongest?.classification || "PAYLOAD_MISSING") === classification,
    ).length,
  ]),
);

let decision = "AUDIT_INCOMPLETE";
let failureReason =
  "One or more persisted review payloads could not be classified.";
let repairInstruction =
  "Do not change task state or call providers until all score containers are classified.";
let readiness = "AUDIT_INCOMPLETE";

if (stateUnchanged && reviewContracts.every((item) => item.strongest)) {
  if (completeNumericCount === reviews.length) {
    decision = "NESTED_SCORE_EXTRACTION_DEFECT_CONFIRMED_FOR_ALL_REVIEWS";
    failureReason =
      "Every stored OpenAI review contains all 12 numeric scores under a nested scores object while the validator reads flat score fields.";
    repairInstruction =
      "Normalize payload.scores into canonical evidence, preserve top-level decision and reason fields, then re-evaluate existing stored responses without provider calls or regeneration.";
    readiness = "READY_FOR_VALIDATOR_REPAIR";
  } else {
    decision = "NESTED_EXTRACTION_DEFECT_PLUS_PROVIDER_CONTRACT_GAPS";
    failureReason =
      `${completeNumericCount} reviews contain the complete nested numeric score contract; ${unresolvedCount} reviews contain classified but incomplete or nonnumeric score containers.`;
    repairInstruction =
      "Repair nested score extraction for complete stored contracts, add fail-closed contract validation for incomplete score containers, and re-evaluate only complete stored responses. Keep incomplete reviews held for a later review-only recovery path; do not regenerate source videos.";
    readiness = "READY_FOR_SPLIT_VALIDATOR_REPAIR";
  }
}

const report = {
  contract: "CHURCHILL_OPENAI_PERCEPTUAL_REVIEW_SCORE_CONTRACT_AUDIT_V1",
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  task_count: graphTasks.length,
  review_task_count: reviews.length,
  complete_numeric_score_contract_count: completeNumericCount,
  unresolved_score_contract_count: unresolvedCount,
  unresolved_classifications: unresolvedClassifications,
  decision,
  failure_reason: failureReason,
  repair_instruction: repairInstruction,
  review_contracts: reviewContracts,
  exact_state_before: before,
  exact_state_after: after,
  state_unchanged: stateUnchanged,
  database_writes_executed: false,
  provider_calls_executed: false,
  provider_polls_executed: false,
  retries_executed: false,
  source_regeneration_authorized: false,
  finalisation_authorized: false,
  publication_authorized: false,
  readiness,
};

fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("READ-ONLY OPENAI PERCEPTUAL REVIEW SCORE-CONTRACT AUDIT");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`GRAPH_ID=${graphId}`);
console.log(`TASK_COUNT=${graphTasks.length}`);
console.log(`REVIEW_TASK_COUNT=${reviews.length}`);
console.log(`COMPLETE_NUMERIC_SCORE_CONTRACT_COUNT=${completeNumericCount}`);
console.log(`UNRESOLVED_SCORE_CONTRACT_COUNT=${unresolvedCount}`);
console.log(`UNRESOLVED_CLASSIFICATIONS=${JSON.stringify(unresolvedClassifications)}`);

for (const item of reviewContracts) {
  const strongest = item.strongest;
  console.log([
    `SCORE_CONTRACT=${item.execution_node_id}`,
    `source=${item.source_execution_node_id || ""}`,
    `classification=${strongest?.classification || "PAYLOAD_MISSING"}`,
    `payload_path=${strongest?.payload_path || ""}`,
    `payload_source=${strongest?.payload_source || ""}`,
    `passed_type=${strongest?.passed?.type || ""}`,
    `passed_value=${strongest?.passed?.value ?? strongest?.passed?.token ?? ""}`,
    `score_container_type=${strongest?.score_container_type || ""}`,
    `numeric_scores=${strongest?.numeric_score_count ?? 0}`,
    `nonnumeric_scores=${strongest?.nonnumeric_present_score_count ?? 0}`,
    `missing_scores=${list(strongest?.missing_score_keys).join(",")}`,
    `unexpected_scores=${list(strongest?.unexpected_score_keys).join(",")}`,
    `failures=${strongest?.failure_count ?? 0}`,
    `repairs=${strongest?.repair_instruction_count ?? 0}`,
    `timestamps=${strongest?.affected_timestamp_count ?? 0}`,
  ].join("|"));

  if (strongest?.classification !== "COMPLETE_NUMERIC_SCORE_CONTRACT") {
    for (const key of SCORE_KEYS) {
      const field = strongest?.score_fields?.[key];
      console.log([
        `SCORE_FIELD=${item.execution_node_id}`,
        `key=${key}`,
        `present=${field?.present ? "YES" : "NO"}`,
        `type=${field?.descriptor?.type || "undefined"}`,
        `value=${field?.numeric_value ?? field?.descriptor?.value ?? field?.descriptor?.token ?? ""}`,
        `length=${field?.descriptor?.length ?? ""}`,
        `sha256=${field?.descriptor?.sha256 ?? ""}`,
      ].join("|"));
    }
  }
}

console.log(`SCORE_CONTRACT_DECISION=${decision}`);
console.log(`SCORE_CONTRACT_FAILURE_REASON=${failureReason}`);
console.log(`SCORE_CONTRACT_REPAIR_INSTRUCTION=${repairInstruction}`);
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
console.log("SOURCE_REGENERATION_AUTHORIZED=NO");
console.log("FINALISATION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

if (!stateUnchanged || readiness === "AUDIT_INCOMPLETE") {
  process.exitCode = 2;
}
