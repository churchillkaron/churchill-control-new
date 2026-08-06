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
const MAX_SCAN_NODES = 12000;
const MAX_EMBEDDED_JSON_TEXTS = 240;
const MAX_JSON_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_REPORTED_PATHS = 160;

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

const DECISION_KEYS = new Set([
  "passed",
  "reviewer_passed",
  "validator_passed",
  "decision",
  "review_decision",
  "verdict",
  "status",
  "response_status",
]);

const FRAME_COUNT_KEYS = new Set([
  "analyzed_image_count",
  "analyzed_images_count",
  "analyzed_frame_count",
  "analyzed_frames_count",
  "frame_count",
  "frames_analyzed",
  "image_count",
  "images_analyzed",
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

function normalizeKey(value) {
  return text(value)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function valueType(value) {
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
  return source.length <= 96 && /^[A-Za-z0-9_.:/-]+$/.test(source)
    ? source
    : null;
}

function stringDescriptor(value, keyName) {
  const source = String(value ?? "");
  const tokenAllowed = [
    "status",
    "decision",
    "verdict",
    "type",
    "object",
    "contract",
    "role",
    "response_status",
  ].some((candidate) => normalizeKey(keyName).includes(candidate));
  const token = tokenAllowed ? safeToken(source) : null;
  return {
    type: "string",
    length: source.length,
    sha256: hash(source),
    ...(token ? { token } : {}),
  };
}

function scalarDescriptor(value, keyName) {
  if (typeof value === "number") {
    return { type: "number", value: Number.isFinite(value) ? value : null };
  }
  if (typeof value === "boolean") return { type: "boolean", value };
  if (typeof value === "string") return stringDescriptor(value, keyName);
  if (value === null) return { type: "null", value: null };
  return { type: valueType(value) };
}

function uniqueBy(items, keyFor) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFor(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function parseStructuredText(value) {
  const source = String(value ?? "").replace(/^\uFEFF/, "").trim();
  if (!source || source.length > MAX_JSON_TEXT_BYTES) {
    return {
      attempted: false,
      parsed: [],
      oversized: source.length > MAX_JSON_TEXT_BYTES,
    };
  }
  if (/^(?:data:|https?:\/\/)/i.test(source)) {
    return { attempted: false, parsed: [], oversized: false };
  }

  const candidates = [];
  const add = (candidate) => {
    const normalized = text(candidate);
    if (normalized && !candidates.includes(normalized)) candidates.push(normalized);
  };

  const startsStructured = /^[\[{]/.test(source);
  const fencedMatches = [...source.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  const hasContractKey = /"(?:overall_score|reviewer_passed|frame_timestamps|analyzed_image_count|scores)"\s*:/i.test(source);
  const likelyOutputText =
    startsStructured || fencedMatches.length > 0 || hasContractKey;

  if (!likelyOutputText) {
    return { attempted: false, parsed: [], oversized: false };
  }

  add(source);
  for (const match of fencedMatches) add(match[1]);

  const firstObject = source.indexOf("{");
  const lastObject = source.lastIndexOf("}");
  if (firstObject >= 0 && lastObject > firstObject) {
    add(source.slice(firstObject, lastObject + 1));
  }

  const firstArray = source.indexOf("[");
  const lastArray = source.lastIndexOf("]");
  if (firstArray >= 0 && lastArray > firstArray) {
    add(source.slice(firstArray, lastArray + 1));
  }

  const parsed = [];
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === "object") {
        const signature = hash(JSON.stringify(value));
        if (!parsed.some((item) => item.signature === signature)) {
          parsed.push({ value, signature });
        }
      }
    } catch {
      // Continue through conservative candidates.
    }
  }

  return {
    attempted: true,
    parsed,
    oversized: false,
  };
}

function isOpenAIWrapper(value) {
  const source = object(value);
  const output = list(source.output);
  const content = list(source.content);
  const objectType = text(source.object).toLowerCase();
  const id = text(source.id).toLowerCase();
  return Boolean(
    (output.length > 0 && output.some((item) =>
      list(item?.content).length > 0 ||
      ["message", "reasoning", "tool_call"].includes(
        text(item?.type).toLowerCase(),
      ),
    )) ||
    content.some((item) =>
      ["output_text", "text", "refusal"].includes(
        text(item?.type).toLowerCase(),
      ),
    ) ||
    typeof source.output_text === "string" ||
    objectType === "response" ||
    id.startsWith("resp_")
  );
}

function providerEnvelope(task) {
  const output = object(task.output);
  const metadata = object(task.metadata);
  const withoutValidator = Object.fromEntries(
    Object.entries(output).filter(
      ([key]) => normalizeKey(key) !== "perceptual_validation",
    ),
  );
  const metadataProvider = Object.fromEntries(
    Object.entries(metadata).filter(([key]) =>
      [
        "providerresponse",
        "providerresult",
        "openairesponse",
      ].includes(normalizeKey(key).replace(/_/g, "")) ||
      normalizeKey(key).includes("provider_response") ||
      normalizeKey(key).includes("provider_result") ||
      normalizeKey(key).includes("openai_response"),
    ),
  );

  return {
    output: withoutValidator,
    metadata_provider: metadataProvider,
  };
}

function canonicalEvidence(task) {
  return object(task.output?.perceptual_validation?.evidence);
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

function analyzeProviderShape(task) {
  const envelope = providerEnvelope(task);
  const report = {
    provider_root_present: false,
    provider_root_keys: [],
    scan_node_count: 0,
    structural_path_count: 0,
    structural_signature: null,
    scan_truncated: false,
    embedded_json_attempt_count: 0,
    embedded_json_parse_count: 0,
    embedded_json_failure_count: 0,
    oversized_json_text_count: 0,
    openai_wrappers: [],
    score_candidates: [],
    frame_candidates: [],
    decision_candidates: [],
    parsed_payloads: [],
    structural_sample_paths: [],
  };

  const signatureEntries = [];
  const samplePaths = [];
  const scanQueue = [
    { path: "output", value: envelope.output, parseDepth: 0 },
    {
      path: "metadata_provider",
      value: envelope.metadata_provider,
      parseDepth: 0,
    },
  ].filter((entry) =>
    entry.value &&
    typeof entry.value === "object" &&
    Object.keys(entry.value).length > 0,
  );

  report.provider_root_present = scanQueue.length > 0;
  report.provider_root_keys = sortedUnique(
    scanQueue.flatMap((entry) =>
      Object.keys(object(entry.value)).map((key) => `${entry.path}.${key}`),
    ),
  );

  function recordPath(pathValue, type, extra = "") {
    const normalizedPath = pathValue.replace(/\[\d+\]/g, "[]");
    signatureEntries.push(`${normalizedPath}|${type}|${extra}`);
    if (samplePaths.length < MAX_REPORTED_PATHS) {
      samplePaths.push(`${normalizedPath}:${type}`);
    }
  }

  function recordScoreObject(currentPath, value) {
    const source = object(value);
    const directNumericScores = {};
    const expectedScores = {};

    for (const [rawKey, rawValue] of Object.entries(source)) {
      const key = normalizeKey(rawKey);
      const number = finiteNumber(rawValue);
      if (number === null) continue;
      if (key.includes("score")) directNumericScores[key] = number;
      if (SCORE_KEYS.includes(key)) expectedScores[key] = number;
    }

    const fields = Object.keys(directNumericScores).sort();
    if (!fields.length) return;

    report.score_candidates.push({
      path: currentPath,
      field_count: fields.length,
      expected_score_count: Object.keys(expectedScores).length,
      complete_expected_scores:
        Object.keys(expectedScores).length === SCORE_KEYS.length,
      nested_score_object:
        currentPath !== "output" && currentPath !== "metadata_provider",
      fields,
      values: Object.fromEntries(
        fields.map((key) => [key, directNumericScores[key]]),
      ),
      missing_expected_scores: SCORE_KEYS.filter(
        (key) => expectedScores[key] === undefined,
      ),
    });
  }

  function recordObjectCandidates(currentPath, value) {
    const source = object(value);
    recordScoreObject(currentPath, source);

    for (const [rawKey, rawValue] of Object.entries(source)) {
      const key = normalizeKey(rawKey);
      if (
        DECISION_KEYS.has(key) &&
        ["string", "boolean", "number"].includes(typeof rawValue)
      ) {
        report.decision_candidates.push({
          path: `${currentPath}.${rawKey}`,
          key,
          value: scalarDescriptor(rawValue, rawKey),
        });
      }

      if (FRAME_COUNT_KEYS.has(key)) {
        const number = finiteNumber(rawValue);
        if (number !== null) {
          report.frame_candidates.push({
            path: `${currentPath}.${rawKey}`,
            kind: "count",
            count: number,
            seven_frames: number === 7,
          });
        }
      }

      if (Array.isArray(rawValue) && /(frame|timestamp|image)/.test(key)) {
        report.frame_candidates.push({
          path: `${currentPath}.${rawKey}`,
          kind: "array_length",
          count: rawValue.length,
          seven_frames: rawValue.length === 7,
        });
      }
    }
  }

  function scan(currentPath, value, parseDepth) {
    if (report.scan_node_count >= MAX_SCAN_NODES) {
      report.scan_truncated = true;
      return;
    }
    report.scan_node_count += 1;

    const type = valueType(value);
    if (Array.isArray(value)) {
      recordPath(currentPath, "array", `length=${value.length}`);
      value.forEach((item, index) =>
        scan(`${currentPath}[${index}]`, item, parseDepth),
      );
      return;
    }

    if (value && typeof value === "object") {
      const keys = Object.keys(value).sort();
      recordPath(currentPath, "object", `keys=${keys.join(",")}`);
      recordObjectCandidates(currentPath, value);
      if (isOpenAIWrapper(value)) {
        report.openai_wrappers.push({
          path: currentPath,
          keys,
        });
      }
      for (const key of keys) {
        scan(`${currentPath}.${key}`, value[key], parseDepth);
      }
      return;
    }

    recordPath(currentPath, type);

    if (typeof value !== "string") return;
    if (report.embedded_json_attempt_count >= MAX_EMBEDDED_JSON_TEXTS) {
      report.scan_truncated = true;
      return;
    }

    const parsed = parseStructuredText(value);
    if (parsed.oversized) {
      report.oversized_json_text_count += 1;
      return;
    }
    if (!parsed.attempted) return;

    report.embedded_json_attempt_count += 1;
    if (!parsed.parsed.length) {
      report.embedded_json_failure_count += 1;
      return;
    }

    for (const [index, item] of parsed.parsed.entries()) {
      report.embedded_json_parse_count += 1;
      const parsedPath = `${currentPath}:parsed${index + 1}`;
      const parsedValue = item.value;
      report.parsed_payloads.push({
        source_path: currentPath,
        parsed_path: parsedPath,
        root_type: valueType(parsedValue),
        root_keys: Object.keys(object(parsedValue)).sort(),
        structural_sha256: item.signature,
      });
      if (parseDepth < 4) scan(parsedPath, parsedValue, parseDepth + 1);
    }
  }

  for (const root of scanQueue) {
    scan(root.path, root.value, root.parseDepth);
  }

  report.openai_wrappers = uniqueBy(
    report.openai_wrappers,
    (item) => item.path,
  ).sort((left, right) => left.path.localeCompare(right.path));
  report.score_candidates = uniqueBy(
    report.score_candidates,
    (item) => `${item.path}|${item.fields.join(",")}`,
  ).sort((left, right) =>
    Number(right.complete_expected_scores) -
      Number(left.complete_expected_scores) ||
    right.expected_score_count - left.expected_score_count ||
    right.field_count - left.field_count ||
    left.path.localeCompare(right.path),
  );
  report.frame_candidates = uniqueBy(
    report.frame_candidates,
    (item) => `${item.path}|${item.kind}|${item.count}`,
  ).sort((left, right) =>
    Number(right.seven_frames) - Number(left.seven_frames) ||
    left.path.localeCompare(right.path),
  );
  report.decision_candidates = uniqueBy(
    report.decision_candidates,
    (item) => `${item.path}|${JSON.stringify(item.value)}`,
  ).sort((left, right) => left.path.localeCompare(right.path));
  report.parsed_payloads = uniqueBy(
    report.parsed_payloads,
    (item) => `${item.source_path}|${item.structural_sha256}`,
  ).sort((left, right) => left.source_path.localeCompare(right.source_path));

  const signatureSource = sortedUnique(signatureEntries).join("\n");
  report.structural_signature = signatureSource ? hash(signatureSource) : null;
  report.structural_path_count = sortedUnique(signatureEntries).length;
  report.structural_sample_paths = sortedUnique(samplePaths).slice(
    0,
    MAX_REPORTED_PATHS,
  );
  return report;
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
  text(process.env.OPENAI_PERCEPTUAL_RESPONSE_SHAPE_AUDIT_OUTPUT) ||
    "/tmp/churchill-openai-perceptual-review-response-shape-audit.json",
);

if (!organizationId || !projectId || !graphId) {
  throw new Error("OPENAI_PERCEPTUAL_RESPONSE_SHAPE_AUDIT_SCOPE_REQUIRED");
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
    `OPENAI_PERCEPTUAL_RESPONSE_SHAPE_AUDIT_TASK_COUNT_INVALID:${graphTasks.length}`,
  );
}
if (reviews.length !== 13) {
  throw new Error(
    `OPENAI_PERCEPTUAL_RESPONSE_SHAPE_AUDIT_REVIEW_COUNT_INVALID:${reviews.length}`,
  );
}

const reviewShapes = reviews.map((task) => {
  const shape = analyzeProviderShape(task);
  const canonical = canonicalEvidence(task);
  const sourceId = sourceTaskId(task);
  const source = sourceById.get(sourceId) || null;
  const canonicalScoreCount = SCORE_KEYS.filter(
    (key) => finiteNumber(canonical[key]) !== null,
  ).length;
  const completeScoreCandidate = shape.score_candidates.find(
    (candidate) => candidate.complete_expected_scores,
  ) || null;
  const strongestScoreCandidate =
    completeScoreCandidate || shape.score_candidates[0] || null;
  const sevenFrameCandidate = shape.frame_candidates.find(
    (candidate) => candidate.seven_frames,
  ) || null;
  const conclusive = Boolean(
    shape.provider_root_present &&
    shape.structural_signature &&
    !shape.scan_truncated &&
    shape.embedded_json_failure_count === 0 &&
    shape.oversized_json_text_count === 0,
  );

  return {
    review_task_id: task.id,
    execution_node_id: executionNodeId(task),
    source_task_id: sourceId || null,
    source_execution_node_id: source ? executionNodeId(source) : null,
    source_status: source?.status || null,
    canonical_score_count: canonicalScoreCount,
    canonical_passed: canonical.passed === true,
    provider_root_present: shape.provider_root_present,
    provider_root_keys: shape.provider_root_keys,
    scan_node_count: shape.scan_node_count,
    structural_path_count: shape.structural_path_count,
    structural_signature: shape.structural_signature,
    scan_truncated: shape.scan_truncated,
    embedded_json_attempt_count: shape.embedded_json_attempt_count,
    embedded_json_parse_count: shape.embedded_json_parse_count,
    embedded_json_failure_count: shape.embedded_json_failure_count,
    oversized_json_text_count: shape.oversized_json_text_count,
    openai_wrapper_count: shape.openai_wrappers.length,
    openai_wrappers: shape.openai_wrappers,
    score_candidate_count: shape.score_candidates.length,
    complete_score_candidate: Boolean(completeScoreCandidate),
    strongest_score_candidate: strongestScoreCandidate,
    score_candidates: shape.score_candidates,
    frame_candidate_count: shape.frame_candidates.length,
    seven_frame_candidate: Boolean(sevenFrameCandidate),
    strongest_frame_candidate:
      sevenFrameCandidate || shape.frame_candidates[0] || null,
    frame_candidates: shape.frame_candidates,
    decision_candidates: shape.decision_candidates,
    parsed_payloads: shape.parsed_payloads,
    structural_sample_paths: shape.structural_sample_paths,
    conclusive,
  };
});

const after = await exactState(
  supabaseAdmin,
  organizationId,
  projectId,
  graphId,
);
const stateUnchanged = JSON.stringify(before) === JSON.stringify(after);
const providerResponseJsonCount = reviewShapes.filter(
  (item) => item.provider_root_present,
).length;
const parsedResponseCount = reviewShapes.filter(
  (item) => item.embedded_json_parse_count > 0,
).length;
const structuralSignatures = sortedUnique(
  reviewShapes.map((item) => item.structural_signature).filter(Boolean),
);
const nestedScoreObjectCount = reviewShapes.reduce(
  (sum, item) =>
    sum + item.score_candidates.filter(
      (candidate) => candidate.nested_score_object,
    ).length,
  0,
);
const anyScoreCandidateCount = reviewShapes.filter(
  (item) => item.score_candidate_count > 0,
).length;
const completeScoreCandidateCount = reviewShapes.filter(
  (item) => item.complete_score_candidate,
).length;
const sevenFrameCandidateCount = reviewShapes.filter(
  (item) => item.seven_frame_candidate,
).length;
const openAIWrapperCount = reviewShapes.filter(
  (item) => item.openai_wrapper_count > 0,
).length;
const conclusiveShapeCount = reviewShapes.filter(
  (item) => item.conclusive,
).length;
const rawStructuralSampleCount = reviewShapes.filter(
  (item) => item.structural_sample_paths.length > 0,
).length;

let responseShapeDecision = "AUDIT_INCOMPLETE";
let responseShapeFailureReason =
  "The persisted provider response shape could not yet be classified conclusively.";
let responseShapeRepairInstruction =
  "Do not change validator or task state until every persisted response has a complete, non-truncated structural classification.";
let readiness = "AUDIT_INCOMPLETE";

if (stateUnchanged && conclusiveShapeCount === reviews.length) {
  if (completeScoreCandidateCount === reviews.length) {
    responseShapeDecision =
      sevenFrameCandidateCount === reviews.length
        ? "NESTED_VALIDATOR_EXTRACTION_DEFECT_CONFIRMED"
        : "SCORE_EXTRACTION_DEFECT_CONFIRMED_FRAME_EVIDENCE_PATH_INCOMPLETE";
    responseShapeFailureReason =
      sevenFrameCandidateCount === reviews.length
        ? "All persisted reviews contain the complete score contract and seven-frame evidence outside the validator's canonical flat evidence object."
        : "All persisted reviews contain the complete score contract, but one or more seven-frame evidence fields require path normalization.";
    responseShapeRepairInstruction =
      "Repair the validator to resolve the discovered semantic payload root, normalize nested score and frame fields into the canonical evidence contract, and then re-evaluate the existing stored responses without provider calls or video regeneration.";
    readiness = "READY_FOR_VALIDATOR_REPAIR";
  } else if (anyScoreCandidateCount > 0) {
    responseShapeDecision = "MIXED_OR_INCOMPLETE_PERSISTED_SCORE_SHAPES";
    responseShapeFailureReason =
      "Persisted review responses contain score fields, but the complete expected score contract is not present in every review at one semantic payload root.";
    responseShapeRepairInstruction =
      "Use the reported score paths to separate extraction defects from provider contract omissions, then repair normalization only for shapes proven complete; do not re-run providers yet.";
    readiness = "READY_FOR_TARGETED_CONTRACT_REPAIR";
  } else {
    responseShapeDecision = "PERSISTED_RESPONSES_OMIT_REQUIRED_SCORE_FIELDS";
    responseShapeFailureReason =
      "The complete persisted provider envelopes were scanned without truncation and no numeric score fields were found.";
    responseShapeRepairInstruction =
      "Repair the OpenAI structured-output contract and response persistence path before any new generation; preserve the existing videos and keep finalisation and publication locked.";
    readiness = "READY_FOR_RESPONSE_CONTRACT_REPAIR";
  }
}

const report = {
  contract: "CHURCHILL_OPENAI_PERCEPTUAL_REVIEW_RESPONSE_SHAPE_AUDIT_V1",
  generated_at: new Date().toISOString(),
  organization_id: organizationId,
  creative_project_id: projectId,
  production_graph_id: graphId,
  task_count: graphTasks.length,
  review_task_count: reviews.length,
  provider_response_json_count: providerResponseJsonCount,
  parsed_response_count: parsedResponseCount,
  structural_signature_count: structuralSignatures.length,
  structural_signatures: structuralSignatures,
  nested_score_object_count: nestedScoreObjectCount,
  any_score_candidate_count: anyScoreCandidateCount,
  complete_score_candidate_count: completeScoreCandidateCount,
  seven_frame_candidate_count: sevenFrameCandidateCount,
  openai_wrapper_count: openAIWrapperCount,
  conclusive_shape_count: conclusiveShapeCount,
  raw_structural_sample_count: rawStructuralSampleCount,
  response_shape_decision: responseShapeDecision,
  response_shape_failure_reason: responseShapeFailureReason,
  response_shape_repair_instruction: responseShapeRepairInstruction,
  review_shapes: reviewShapes,
  exact_state_before: before,
  exact_state_after: after,
  state_unchanged: stateUnchanged,
  database_writes_executed: false,
  provider_calls_executed: false,
  provider_polls_executed: false,
  retries_executed: false,
  finalisation_authorized: false,
  publication_authorized: false,
  readiness,
};

fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

console.log("============================================================");
console.log("READ-ONLY OPENAI PERCEPTUAL REVIEW RESPONSE-SHAPE AUDIT");
console.log("============================================================");
console.log(`OUTPUT=${outputPath}`);
console.log(`GRAPH_ID=${graphId}`);
console.log(`TASK_COUNT=${graphTasks.length}`);
console.log(`REVIEW_TASK_COUNT=${reviews.length}`);
console.log(`PROVIDER_RESPONSE_JSON_COUNT=${providerResponseJsonCount}`);
console.log(`PARSED_RESPONSE_COUNT=${parsedResponseCount}`);
console.log(`STRUCTURAL_SIGNATURE_COUNT=${structuralSignatures.length}`);
console.log(`NESTED_SCORE_OBJECT_COUNT=${nestedScoreObjectCount}`);
console.log(`ANY_SCORE_CANDIDATE_COUNT=${anyScoreCandidateCount}`);
console.log(`COMPLETE_SCORE_CANDIDATE_COUNT=${completeScoreCandidateCount}`);
console.log(`SEVEN_FRAME_CANDIDATE_COUNT=${sevenFrameCandidateCount}`);
console.log(`OPENAI_WRAPPER_COUNT=${openAIWrapperCount}`);
console.log(`CONCLUSIVE_SHAPE_COUNT=${conclusiveShapeCount}`);
console.log(`RAW_STRUCTURAL_SAMPLE_COUNT=${rawStructuralSampleCount}`);

for (const item of reviewShapes) {
  console.log([
    "RESPONSE_SHAPE",
    item.execution_node_id,
    `source=${item.source_execution_node_id || ""}`,
    `provider_root=${item.provider_root_present ? "YES" : "NO"}`,
    `paths=${item.structural_path_count}`,
    `signature=${item.structural_signature || ""}`,
    `parsed=${item.embedded_json_parse_count}`,
    `parse_failures=${item.embedded_json_failure_count}`,
    `wrappers=${item.openai_wrapper_count}`,
    `score_candidates=${item.score_candidate_count}`,
    `complete_scores=${item.complete_score_candidate ? "YES" : "NO"}`,
    `seven_frames=${item.seven_frame_candidate ? "YES" : "NO"}`,
    `canonical_scores=${item.canonical_score_count}`,
    `conclusive=${item.conclusive ? "YES" : "NO"}`,
  ].join("|"));

  for (const candidate of item.score_candidates) {
    console.log([
      `SCORE_CANDIDATE=${item.execution_node_id}`,
      `path=${candidate.path}`,
      `fields=${candidate.fields.join(",")}`,
      `expected=${candidate.expected_score_count}/${SCORE_KEYS.length}`,
      `complete=${candidate.complete_expected_scores ? "YES" : "NO"}`,
      `values=${JSON.stringify(candidate.values)}`,
    ].join("|"));
  }

  for (const candidate of item.frame_candidates) {
    console.log([
      `FRAME_CANDIDATE=${item.execution_node_id}`,
      `path=${candidate.path}`,
      `kind=${candidate.kind}`,
      `count=${candidate.count}`,
      `seven=${candidate.seven_frames ? "YES" : "NO"}`,
    ].join("|"));
  }

  for (const payload of item.parsed_payloads) {
    console.log([
      `PARSED_PAYLOAD=${item.execution_node_id}`,
      `source_path=${payload.source_path}`,
      `parsed_path=${payload.parsed_path}`,
      `root_type=${payload.root_type}`,
      `root_keys=${payload.root_keys.join(",")}`,
      `shape_sha256=${payload.structural_sha256}`,
    ].join("|"));
  }
}

console.log(`RESPONSE_SHAPE_DECISION=${responseShapeDecision}`);
console.log(`RESPONSE_SHAPE_FAILURE_REASON=${responseShapeFailureReason}`);
console.log(`RESPONSE_SHAPE_REPAIR_INSTRUCTION=${responseShapeRepairInstruction}`);
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
console.log("FINALISATION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log("TERMINAL_REMAINS_OPEN=YES");

if (!stateUnchanged || readiness === "AUDIT_INCOMPLETE") {
  process.exitCode = 2;
}
