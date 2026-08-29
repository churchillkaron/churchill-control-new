export const AVANTIQO_CODE_MISSION_VERIFIED_FAILURE_UTILITY_CONTRACT =
  "AVANTIQO_CODE_MISSION_VERIFIED_FAILURE_UTILITY_V1";

const CODE_CAPABILITY_KEY = "platform.code_ai_autonomous.execute";
const CODE_EMPLOYEE_RUNTIME_CONTRACT = "AVANTIQO_CODE_AI_EMPLOYEE_RUNTIME_V1";
const CODE_EMPLOYEE_COMPLETION_CONTRACT = "AVANTIQO_CODE_AI_EMPLOYEE_COMPLETION_V1";
const INTELLIGENCE_CODE_MISSION_CONTRACT = "AVANTIQO_INTELLIGENCE_CODE_MISSION_V1";
const MAX_KNOWLEDGE_ITEMS = 20;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function sameHead(left, right) {
  const a = text(left, 160).toLowerCase();
  const b = text(right, 160).toLowerCase();
  return Boolean(a && b && a === b);
}

function budgetExhaustionMode(codeResult = {}) {
  const source = object(codeResult);
  if (source.success === true || text(source.status, 80) !== "blocked") return null;
  const reason = text(source.reason, 300);
  if (/^CODE_AI_EMPLOYEE_REASONING_BUDGET_EXHAUSTED:\d+:\d+$/.test(reason)) {
    return "REASONING_BUDGET_EXHAUSTED";
  }
  if (/^CODE_AI_EMPLOYEE_PASS_BUDGET_EXHAUSTED:\d+$/.test(reason)) {
    return "PASS_BUDGET_EXHAUSTED";
  }
  return null;
}

function reusableKnowledge(missionContext = {}) {
  const learned = object(missionContext?.learned_knowledge);
  if (learned.evaluated !== true) return [];
  return list(learned.knowledge)
    .map(object)
    .filter((item) =>
      text(item.id, 160) ||
      text(item.topic_key, 240) ||
      text(item.internal_reference, 500) ||
      text(object(item.provenance).topic_key, 240) ||
      text(object(item.provenance).internal_reference, 500)
    )
    .slice(0, MAX_KNOWLEDGE_ITEMS);
}

function latestFailedVerification(state = {}) {
  const tests = list(state?.tests);
  const failures = list(state?.failures);
  for (let index = tests.length - 1; index >= 0; index -= 1) {
    const test = object(tests[index]);
    const exitCode = Number(test.exit_code);
    if (!Number.isFinite(exitCode)) continue;
    if (exitCode === 0) return null;
    const operationId = text(test.operation_id, 240);
    const matchingFailure = failures
      .slice()
      .reverse()
      .map(object)
      .find((failure) => text(failure.operation_id, 240) === operationId);
    if (!matchingFailure) return null;
    const failureMessage = text(matchingFailure.message || matchingFailure.reason, 1200);
    if (text(matchingFailure.action, 80) !== "verify") return null;
    if (!failureMessage.startsWith("CODE_AI_VERIFICATION_FAILED:")) return null;
    return {
      operation_id: operationId || null,
      command: text(test.command, 300) || null,
      args: list(test.args).slice(0, 24).map((item) => text(item, 500)),
      exit_code: exitCode,
      failure_message: failureMessage,
    };
  }
  return null;
}

function failureEligibility({ missionContext, codeResult }) {
  const mission = object(missionContext);
  const result = object(codeResult);
  const state = object(result.state);
  const completion = object(result.employee_completion);
  const expectedHead = text(mission.repository_context?.head_sha, 160);
  const executedHead = text(state.base_commit, 160);
  const mode = budgetExhaustionMode(result);
  const failedVerification = latestFailedVerification(state);
  const blockers = [];

  if (text(mission.contract, 200) !== INTELLIGENCE_CODE_MISSION_CONTRACT) {
    blockers.push("INTELLIGENCE_CODE_MISSION_CONTRACT_REQUIRED");
  }
  if (text(mission.status, 120) !== "READY_FOR_CODE") {
    blockers.push("INTELLIGENCE_CODE_MISSION_READY_REQUIRED");
  }
  if (text(result.contract || result.employee_runtime_contract, 200) !==
      CODE_EMPLOYEE_RUNTIME_CONTRACT) {
    blockers.push("CODE_EMPLOYEE_RUNTIME_CONTRACT_REQUIRED");
  }
  if (!mode) blockers.push("TERMINAL_EMPLOYEE_BUDGET_EXHAUSTION_REQUIRED");
  if (text(completion.contract, 200) !== CODE_EMPLOYEE_COMPLETION_CONTRACT) {
    blockers.push("CODE_EMPLOYEE_COMPLETION_CONTRACT_REQUIRED");
  }
  if (completion.complete === true) blockers.push("COMPLETED_RESULT_CANNOT_BE_FAILURE_SIGNAL");
  if (!sameHead(expectedHead, executedHead)) blockers.push("MISSION_REPOSITORY_HEAD_MISMATCH");
  if (!list(state.files_changed).length) blockers.push("CHANGED_SOURCE_REQUIRED");
  if (!list(state.source_changes).length && !text(state.patch, 1)) {
    blockers.push("OBSERVED_SOURCE_CHANGE_REQUIRED");
  }
  if (!failedVerification) blockers.push("LATEST_FAILED_DETERMINISTIC_VERIFICATION_REQUIRED");
  if (state.planner_pending) blockers.push("PLANNER_PENDING_NOT_TERMINAL");

  if (mode === "REASONING_BUDGET_EXHAUSTED") {
    if (text(state.status, 100) !== "repair_required") {
      blockers.push("REASONING_EXHAUSTION_MUST_END_IN_REPAIR_REQUIRED_STATE");
    }
    const currentBlockers = list(state.blockers).map((item) => text(item, 1200));
    if (!currentBlockers.some((item) => item.startsWith("CODE_AI_VERIFICATION_FAILED:"))) {
      blockers.push("REASONING_EXHAUSTION_VERIFICATION_BLOCKER_REQUIRED");
    }
  }

  if (mode === "PASS_BUDGET_EXHAUSTED" && text(state.status, 100) !== "running") {
    blockers.push("PASS_EXHAUSTION_MUST_FOLLOW_CONTROLLER_REPAIR_CONTINUATION");
  }

  return {
    eligible: blockers.length === 0,
    blockers,
    mode,
    failed_verification: failedVerification,
    expected_repository_head: expectedHead || null,
    executed_repository_head: executedHead || null,
  };
}

export function buildAvantiqoVerifiedUnsuccessfulCodeMissionKnowledgeUtilityObservation({
  mission_context,
  code_result,
} = {}) {
  const missionContext = object(mission_context);
  const result = object(code_result);
  const eligibility = failureEligibility({ missionContext, codeResult: result });
  if (!eligibility.eligible) {
    return {
      contract: AVANTIQO_CODE_MISSION_VERIFIED_FAILURE_UTILITY_CONTRACT,
      applicable: false,
      status: "NOT_ELIGIBLE_VERIFIED_CODE_FAILURE",
      blockers: eligibility.blockers,
      observation_key: null,
      decision: null,
      execution: null,
      governance: {
        deterministic_verification_failure_required: true,
        provider_or_scheduler_failure_eligible: false,
        ordinary_repair_required_eligible: false,
        repository_move_eligible: false,
        authorization_effect: "NONE",
      },
    };
  }

  const knowledge = reusableKnowledge(missionContext);
  if (!knowledge.length) {
    return {
      contract: AVANTIQO_CODE_MISSION_VERIFIED_FAILURE_UTILITY_CONTRACT,
      applicable: false,
      status: "NOT_APPLICABLE_NO_REUSED_KNOWLEDGE",
      blockers: [],
      observation_key: null,
      decision: null,
      execution: null,
      governance: {
        deterministic_verification_failure_required: true,
        explicit_reused_knowledge_required: true,
        authorization_effect: "NONE",
      },
    };
  }

  const missionId = text(missionContext.mission?.id, 240);
  const repositoryHead = text(result.state?.base_commit, 160).toLowerCase();
  if (!missionId || !repositoryHead) {
    throw new Error("AVANTIQO_CODE_MISSION_VERIFIED_FAILURE_UTILITY_LINEAGE_REQUIRED");
  }

  const verification = eligibility.failed_verification;
  return {
    contract: AVANTIQO_CODE_MISSION_VERIFIED_FAILURE_UTILITY_CONTRACT,
    applicable: true,
    status: "READY_FOR_VERIFIED_FAILURE_UTILITY_FEEDBACK",
    blockers: [],
    observation_key:
      `verified-code-knowledge-utility:${CODE_CAPABILITY_KEY}:${missionId}:${repositoryHead}`,
    decision: {
      knowledge_reuse: {
        reused: true,
        reason: "VERIFIED_CODE_MISSION_REUSED_SHARED_KNOWLEDGE",
        knowledge,
      },
      evidence_graph: {
        checked: object(missionContext.learned_knowledge).evidence_graph_checked === true,
        block_knowledge_reuse: false,
      },
    },
    evidence: {
      mission_contract: INTELLIGENCE_CODE_MISSION_CONTRACT,
      verified_repository_head: repositoryHead,
      failure_mode: eligibility.mode,
      deterministic_verification: {
        operation_id: verification.operation_id,
        command: verification.command,
        args: verification.args,
        exit_code: verification.exit_code,
        failed: true,
      },
    },
    execution: {
      status: "failed",
      capability: {
        key: CODE_CAPABILITY_KEY,
        mode: "write",
      },
      reason: `CODE_AI_VERIFIED_UNSUCCESSFUL_COMPLETION:${verification.failure_message}`,
    },
    governance: {
      verified_unsuccessful_code_completion_required: true,
      terminal_budget_exhaustion_required: true,
      latest_deterministic_verification_failure_required: true,
      exact_repository_lineage_required: true,
      changed_source_required: true,
      explicit_reused_knowledge_required: true,
      provider_or_scheduler_failure_eligible: false,
      planner_pending_eligible: false,
      ordinary_repair_required_eligible: false,
      repository_move_eligible: false,
      later_successful_verification_cancels_failure_signal: true,
      relationship: "OBSERVATIONAL_ASSOCIATION_ONLY",
      causal_attribution_allowed: false,
      raw_reasoning_included: false,
      raw_source_code_included: false,
      raw_patch_included: false,
      customer_scope_identifier_included: false,
      authorization_effect: "NONE",
      automatic_knowledge_promotion: false,
      automatic_training_effect: "NONE",
    },
  };
}

async function defaultRecordKnowledgeUtility(input) {
  const module = await import("./AvantiqoKnowledgeUtilityAttributionRuntime.js");
  return module.recordAvantiqoKnowledgeUtilityObservation(input);
}

export async function recordAvantiqoVerifiedUnsuccessfulCodeMissionKnowledgeUtility({
  mission_context,
  code_result,
  database = null,
  recorder = null,
} = {}) {
  const projected = buildAvantiqoVerifiedUnsuccessfulCodeMissionKnowledgeUtilityObservation({
    mission_context,
    code_result,
  });
  if (!projected.applicable) {
    return {
      contract: AVANTIQO_CODE_MISSION_VERIFIED_FAILURE_UTILITY_CONTRACT,
      status: projected.status,
      written: false,
      applicable: false,
      blockers: projected.blockers,
      failure_reason: null,
      governance: projected.governance,
    };
  }

  const record = typeof recorder === "function" ? recorder : defaultRecordKnowledgeUtility;
  try {
    const recorded = await record({
      decision: projected.decision,
      evidence: projected.evidence,
      execution: projected.execution,
      observation_key: projected.observation_key,
      database,
    });
    return {
      contract: AVANTIQO_CODE_MISSION_VERIFIED_FAILURE_UTILITY_CONTRACT,
      status: recorded?.written === true
        ? "VERIFIED_FAILURE_UTILITY_FEEDBACK_RECORDED"
        : `VERIFIED_FAILURE_UTILITY_FEEDBACK_${text(recorded?.reason, 160) || "NOT_WRITTEN"}`,
      written: recorded?.written === true,
      applicable: true,
      outcome: text(recorded?.outcome, 120) || "VERIFIED_FAILURE",
      idempotent_observation: recorded?.idempotent_observation === true,
      memory_key: text(recorded?.memory_key, 240) || null,
      receipt_fingerprint: text(recorded?.receipt_fingerprint, 120) || null,
      failure_reason: null,
      governance: projected.governance,
    };
  } catch (error) {
    return {
      contract: AVANTIQO_CODE_MISSION_VERIFIED_FAILURE_UTILITY_CONTRACT,
      status: "VERIFIED_FAILURE_UTILITY_FEEDBACK_FAILED",
      written: false,
      applicable: true,
      failure_reason: text(error?.message || error, 500),
      governance: {
        ...object(projected.governance),
        code_failure_result_remains_unchanged: true,
        observational_feedback_failure_does_not_block_code: true,
        automatic_knowledge_promotion: false,
        automatic_training_effect: "NONE",
      },
    };
  }
}

export const AvantiqoCodeMissionVerifiedFailureUtilityRuntime = Object.freeze({
  contract: AVANTIQO_CODE_MISSION_VERIFIED_FAILURE_UTILITY_CONTRACT,
  buildObservation: buildAvantiqoVerifiedUnsuccessfulCodeMissionKnowledgeUtilityObservation,
  record: recordAvantiqoVerifiedUnsuccessfulCodeMissionKnowledgeUtility,
});

export default AvantiqoCodeMissionVerifiedFailureUtilityRuntime;
