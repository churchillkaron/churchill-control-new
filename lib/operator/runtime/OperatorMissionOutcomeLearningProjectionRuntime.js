import { createHash } from "node:crypto";
import {
  buildOperatorIntelligenceDecisionOutcomeContract,
} from "./OperatorIntelligenceDecisionOutcomeContractRuntime.js";

export const OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT =
  "AVANTIQO_OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_V1";

const MAX_CRITERIA = 12;
const MAX_CODES = 24;
const CODE_RE = /^[A-Za-z][A-Za-z0-9._:-]{1,159}$/;
const PATH_RE = /^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*){0,7}$/;
const KINDS = new Set(["success", "warning", "failure"]);
const COMPARATORS = new Set([
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte",
  "contains",
  "exists",
  "truthy",
  "falsy",
]);
const VALUE_OPTIONAL_COMPARATORS = new Set(["exists", "truthy", "falsy"]);
const PATTERN_FIELDS = new Set([
  "mission_family",
  "intervention_code",
  "intervention_class",
  "knowledge_domain",
  "condition_codes",
  "boundary_condition_codes",
  "failure_mode_codes",
  "stability",
]);
const SPEC_FIELDS = new Set(["pattern", "criteria"]);
const CRITERION_FIELDS = new Set([
  "id",
  "kind",
  "comparator",
  "expected_value",
  "source_step_id",
  "source_path",
]);
const SENSITIVE_PATH_SEGMENTS = new Set([
  "authorization",
  "cookie",
  "credential",
  "credentials",
  "customer",
  "email",
  "entity",
  "name",
  "organization",
  "party",
  "password",
  "payload",
  "phone",
  "raw",
  "reasoning",
  "secret",
  "session",
  "token",
  "user",
]);

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function code(value, field, required = false) {
  const normalized = text(value, 160);
  if (!normalized) {
    if (required) {
      throw new Error(
        `${OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT}_${field.toUpperCase()}_REQUIRED`,
      );
    }
    return null;
  }
  if (!CODE_RE.test(normalized)) {
    throw new Error(
      `${OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT}_${field.toUpperCase()}_MUST_BE_DEIDENTIFIED_CODE`,
    );
  }
  return normalized;
}

function codes(values, field) {
  return [...new Set(
    list(values)
      .map((value) => code(value, field, false))
      .filter(Boolean),
  )]
    .sort()
    .slice(0, MAX_CODES);
}

function rejectUnknownFields(value, allowed, label) {
  const unknown = Object.keys(object(value)).filter((key) => !allowed.has(key));
  if (unknown.length) {
    throw new Error(
      `${OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT}_${label}_FIELD_FORBIDDEN:${unknown.sort().join(",")}`,
    );
  }
}

function normalizePattern(value = {}) {
  const source = object(value);
  rejectUnknownFields(source, PATTERN_FIELDS, "PATTERN");
  const stability = text(source.stability, 40).toLowerCase() || "mutable";
  if (!["stable", "mutable"].includes(stability)) {
    throw new Error(
      `${OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT}_STABILITY_INVALID`,
    );
  }
  return {
    mission_family: code(source.mission_family, "mission_family", true),
    intervention_code: code(source.intervention_code, "intervention_code", true),
    intervention_class: code(source.intervention_class, "intervention_class", false),
    knowledge_domain: code(source.knowledge_domain, "knowledge_domain", true),
    condition_codes: codes(source.condition_codes, "condition_code"),
    boundary_condition_codes: codes(
      source.boundary_condition_codes,
      "boundary_condition_code",
    ),
    failure_mode_codes: codes(source.failure_mode_codes, "failure_mode_code"),
    stability,
  };
}

function normalizeExpectedValue(value, comparator) {
  if (VALUE_OPTIONAL_COMPARATORS.has(comparator)) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    return code(value, "expected_value", true);
  }
  throw new Error(
    `${OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT}_EXPECTED_VALUE_MUST_BE_SAFE_SCALAR`,
  );
}

function sensitivePathSegment(segment) {
  const normalized = text(segment, 240);
  const tokens = normalized
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[_-]+/)
    .filter(Boolean);
  const compact = normalized.toLowerCase();
  return (
    SENSITIVE_PATH_SEGMENTS.has(compact) ||
    tokens.some((token) => SENSITIVE_PATH_SEGMENTS.has(token)) ||
    /(?:api[_-]?key|access[_-]?key|private[_-]?key)/.test(compact)
  );
}

function safeSourcePath(value) {
  const path = text(value, 240);
  if (!PATH_RE.test(path)) {
    throw new Error(
      `${OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT}_SOURCE_PATH_INVALID`,
    );
  }
  const segments = path.split(".");
  if (segments.some((segment) => sensitivePathSegment(segment))) {
    throw new Error(
      `${OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT}_SOURCE_PATH_SENSITIVE`,
    );
  }
  return path;
}

function normalizeCriterion(value, index, finalStepId) {
  const source = object(value);
  rejectUnknownFields(source, CRITERION_FIELDS, "CRITERION");
  const id = code(source.id || `criterion-${index + 1}`, "criterion_id", true);
  const kind = text(source.kind, 40).toLowerCase();
  const comparator = text(source.comparator, 40).toLowerCase();
  const sourceStepId = code(source.source_step_id, "source_step_id", true);
  if (!KINDS.has(kind)) {
    throw new Error(
      `${OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT}_CRITERION_KIND_INVALID`,
    );
  }
  if (!COMPARATORS.has(comparator)) {
    throw new Error(
      `${OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT}_CRITERION_COMPARATOR_INVALID`,
    );
  }
  if (sourceStepId !== finalStepId) {
    throw new Error(
      `${OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT}_FINAL_VERIFICATION_SOURCE_REQUIRED`,
    );
  }
  return {
    id,
    kind,
    comparator,
    expected_value: normalizeExpectedValue(source.expected_value, comparator),
    source_step_id: sourceStepId,
    source_path: safeSourcePath(source.source_path),
    observation_source: `mission.verify.${sourceStepId}.${id}`.slice(0, 240),
  };
}

function normalizeSpecification(specification, steps) {
  const source = object(specification);
  if (!Object.keys(source).length) return null;
  rejectUnknownFields(source, SPEC_FIELDS, "SPEC");

  const missionSteps = list(steps);
  const finalStep = object(missionSteps[missionSteps.length - 1]);
  const finalStepId = code(finalStep.id, "final_step_id", true);
  if (!object(finalStep.verify_after).capability_key) {
    throw new Error(
      `${OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT}_FINAL_REGISTERED_VERIFICATION_REQUIRED`,
    );
  }

  const pattern = normalizePattern(source.pattern);
  const criteria = list(source.criteria)
    .slice(0, MAX_CRITERIA)
    .map((criterion, index) => normalizeCriterion(criterion, index, finalStepId));
  if (criteria.length < 2) {
    throw new Error(
      `${OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT}_AT_LEAST_SUCCESS_AND_FAILURE_CRITERIA_REQUIRED`,
    );
  }
  if (!criteria.some((criterion) => criterion.kind === "success")) {
    throw new Error(
      `${OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT}_SUCCESS_CRITERION_REQUIRED`,
    );
  }
  if (!criteria.some((criterion) => criterion.kind === "failure")) {
    throw new Error(
      `${OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT}_FAILURE_CRITERION_REQUIRED`,
    );
  }
  if (new Set(criteria.map((criterion) => criterion.id)).size !== criteria.length) {
    throw new Error(
      `${OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT}_CRITERION_IDS_MUST_BE_UNIQUE`,
    );
  }
  if (pattern.failure_mode_codes.length && !criteria.some((criterion) => criterion.kind === "failure")) {
    throw new Error(
      `${OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT}_FAILURE_MODE_MAPPING_REQUIRED`,
    );
  }

  return { pattern, criteria };
}

function buildOutcomeContract(spec) {
  const failureModeIds = spec.pattern.failure_mode_codes;
  const criteria = spec.criteria.map((criterion) => ({
    id: criterion.id,
    kind: criterion.kind,
    signal: `mission_outcome:${criterion.id}`,
    comparator: criterion.comparator,
    expected_value: criterion.expected_value,
    observation_source: criterion.observation_source,
    verification_criteria: ["registered-mission-verification"],
    failure_mode_ids:
      criterion.kind === "failure" ? failureModeIds : [],
    required: true,
  }));
  const contract = buildOperatorIntelligenceDecisionOutcomeContract({
    decision: {
      candidate_id: spec.pattern.intervention_code,
      mutates: true,
      irreversible: false,
      requires_human: true,
    },
    criteria,
    review_policy: {
      planned_review_trigger: "next_verified_observation",
      review_on_warning: true,
      review_on_failure: true,
      review_on_invalidation_trigger: true,
    },
    provenance: { invalidation_triggers: [] },
    contingency: {
      failure_modes: failureModeIds.map((id) => ({
        id,
        severity: "high",
        decision_invalidating: true,
      })),
    },
    decision_critical: true,
  });
  if (
    contract.status !== "OUTCOME_CONTRACT_READY" ||
    contract.outcome_contract_ready !== true
  ) {
    throw new Error(
      `${OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT}_OUTCOME_CONTRACT_NOT_READY:${list(contract.issues).join(",")}`,
    );
  }
  return contract;
}

export function prepareOperatorMissionOutcomeLearningProjection({
  specification = null,
  steps = [],
} = {}) {
  const spec = normalizeSpecification(specification, steps);
  if (!spec) return null;
  const outcomeContract = buildOutcomeContract(spec);
  return {
    contract: OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT,
    status: "READY_FOR_VERIFIED_MISSION_COMPLETION",
    spec,
    pattern: spec.pattern,
    outcome_contract: outcomeContract,
    mappings: spec.criteria.map((criterion) => ({
      criterion_id: criterion.id,
      source_step_id: criterion.source_step_id,
      source_path: criterion.source_path,
      observation_source: criterion.observation_source,
    })),
    governance: {
      explicit_structured_projection_required: true,
      server_built_outcome_contract: true,
      final_registered_verification_only: true,
      freeform_mission_text_used: false,
      raw_write_result_used: false,
      customer_identifiers_allowed: false,
      sensitive_source_paths_allowed: false,
      reusable_platform_knowledge_written: false,
      automatic_knowledge_promotion: false,
      authorization_effect: "NONE",
    },
  };
}

function pathValue(value, path) {
  let current = value;
  for (const segment of path.split(".")) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return { found: false, value: null };
    }
    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return { found: false, value: null };
    }
    current = current[segment];
  }
  return { found: true, value: current };
}

function safeObservedScalar(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && CODE_RE.test(text(value, 160))) {
    return text(value, 160);
  }
  throw new Error(
    `${OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT}_OBSERVED_VALUE_MUST_BE_SAFE_SCALAR`,
  );
}

function digest(...parts) {
  return createHash("sha256")
    .update(parts.map((part) => String(part ?? "")).join("|"))
    .digest("hex");
}

export function buildOperatorMissionOutcomeLearningObservations({
  projection,
  mission_result,
  run_id,
  now = new Date(),
} = {}) {
  const prepared = object(projection);
  const result = object(mission_result);
  const runId = text(run_id, 240);
  if (
    prepared.contract !== OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT ||
    prepared.status !== "READY_FOR_VERIFIED_MISSION_COMPLETION"
  ) {
    throw new Error(
      `${OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT}_SERVER_PROJECTION_REQUIRED`,
    );
  }
  if (!runId) {
    throw new Error(
      `${OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT}_RUN_ID_REQUIRED`,
    );
  }
  if (
    text(result.status, 40) !== "completed" ||
    text(result.mission_mode, 80) !== "durable_registered_sequence" ||
    result.all_steps_preflighted !== true ||
    Number(result.remaining_steps || 0) !== 0 ||
    text(result.current_step_id)
  ) {
    throw new Error(
      `${OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT}_VERIFIED_MISSION_COMPLETION_REQUIRED`,
    );
  }

  const resultSteps = list(result.steps);
  const observedAt = now instanceof Date ? now.toISOString() : new Date(now).toISOString();
  return prepared.mappings.map((mapping) => {
    const step = resultSteps.find((candidate) => text(candidate?.id) === mapping.source_step_id);
    if (
      !step ||
      !["completed", "verification_completed"].includes(text(step.status, 80)) ||
      !object(step.verification) ||
      !Object.keys(object(step.verification)).length
    ) {
      throw new Error(
        `${OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT}_FINAL_VERIFICATION_EVIDENCE_REQUIRED`,
      );
    }
    const extracted = pathValue(step.verification, mapping.source_path);
    if (!extracted.found) {
      throw new Error(
        `${OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT}_MAPPED_VERIFICATION_VALUE_MISSING`,
      );
    }
    const observedValue = safeObservedScalar(extracted.value);
    const proof = digest(
      "operator-mission-outcome-proof-v1",
      runId,
      mapping.source_step_id,
      mapping.criterion_id,
      mapping.source_path,
      JSON.stringify(observedValue),
    );
    return {
      id: `mission-observation-${proof.slice(0, 32)}`,
      criterion_id: mapping.criterion_id,
      observation_source: mapping.observation_source,
      observed_value: observedValue,
      verified: true,
      verification_status: "pass",
      current: true,
      observed_at: observedAt,
      evidence_ids: [`mission-proof-${proof.slice(0, 32)}`],
    };
  });
}

export const OperatorMissionOutcomeLearningProjectionRuntime = Object.freeze({
  contract: OPERATOR_MISSION_OUTCOME_LEARNING_PROJECTION_CONTRACT,
  prepare: prepareOperatorMissionOutcomeLearningProjection,
  buildObservations: buildOperatorMissionOutcomeLearningObservations,
});

export default OperatorMissionOutcomeLearningProjectionRuntime;
