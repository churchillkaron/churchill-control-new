import {
  AVANTIQO_INTELLIGENCE_CODE_MISSION_CONTRACT,
  createAvantiqoCodeMissionLearningFeedback,
} from "./AvantiqoIntelligenceCodeMissionRuntime.js";
import {
  ingestAvantiqoCodeMissionLearningFeedback,
} from "./AvantiqoCodeMissionLearningIngressRuntime.js";

export const AVANTIQO_CODE_MISSION_LEARNING_HANDOFF_CONTRACT =
  "AVANTIQO_CODE_MISSION_LEARNING_HANDOFF_V1";
export const AVANTIQO_CODE_MISSION_KNOWLEDGE_UTILITY_FEEDBACK_CONTRACT =
  "AVANTIQO_CODE_MISSION_KNOWLEDGE_UTILITY_FEEDBACK_V1";

const CODE_EMPLOYEE_RUNTIME_CONTRACT = "AVANTIQO_CODE_AI_EMPLOYEE_RUNTIME_V1";
const CODE_EMPLOYEE_COMPLETION_CONTRACT = "AVANTIQO_CODE_AI_EMPLOYEE_COMPLETION_V1";
const CODE_CAPABILITY_KEY = "platform.code_ai_autonomous.execute";
const MAX_ITEMS = 80;

function text(value, limit = 12000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function strings(value, limit = MAX_ITEMS, itemLimit = 1800) {
  return [...new Set(
    list(value)
      .map((item) => text(item, itemLimit))
      .filter(Boolean),
  )].slice(0, limit);
}

function sameHead(left, right) {
  const a = text(left, 160).toLowerCase();
  const b = text(right, 160).toLowerCase();
  return Boolean(a && b && a === b);
}

function structuralVerificationEntry(value = {}) {
  const source = object(value);
  const result = object(source.result);
  const command = text(source.command || result.command, 500) || null;
  const args = list(source.args || result.args)
    .slice(0, 24)
    .map((item) => text(item, 500))
    .filter(Boolean);
  const exitCodeCandidate = source.exit_code ?? result.exit_code;
  const exitCode = Number.isInteger(Number(exitCodeCandidate))
    ? Number(exitCodeCandidate)
    : null;
  const passed = source.passed === true || (
    exitCode === 0 &&
    ["completed", "passed", "success"].includes(
      text(source.status || result.status, 80).toLowerCase(),
    )
  );
  return {
    contract: text(source.contract, 180) || null,
    check: text(source.check || source.name || source.kind, 500) || null,
    operation_id: text(source.operation_id, 240) || null,
    command,
    args,
    exit_code: exitCode,
    status: text(source.status || result.status, 120) || null,
    passed,
  };
}

function successfulVerificationEvidence(state) {
  return list(state?.verification)
    .slice(-40)
    .map(structuralVerificationEntry)
    .filter((entry) => entry.passed === true);
}

function finalDiffEvidence(state) {
  const entries = list(state?.evidence)
    .filter((entry) =>
      text(entry?.kind, 120) === "operation" &&
      text(entry?.action, 80) === "diff" &&
      text(entry?.status, 80) === "completed"
    )
    .slice(-8)
    .map((entry) => ({
      contract: "AVANTIQO_CODE_FINAL_DIFF_EVIDENCE_V1",
      check: "final-diff",
      operation_id: text(entry?.operation_id, 240) || null,
      status: "completed",
      passed: true,
    }));
  return entries;
}

function productCompletionEvidence(state) {
  return list(state?.evidence)
    .filter((entry) =>
      text(entry?.kind, 180) === "product_completion_criteria_evidence" &&
      entry?.verified === true
    )
    .slice(-6)
    .map((entry) => ({
      contract: text(entry?.contract, 180) ||
        "AVANTIQO_CODE_AI_EMPLOYEE_CRITERIA_EVIDENCE_V1",
      check: "product-completion-criteria",
      criteria_count: Number.isInteger(Number(entry?.criteria_count))
        ? Number(entry.criteria_count)
        : null,
      passed: true,
      status: "verified",
    }));
}

function verificationEvidence(codeResult) {
  const state = object(codeResult?.state);
  const completion = object(codeResult?.employee_completion);
  const evidence = [
    ...successfulVerificationEvidence(state),
    ...finalDiffEvidence(state),
    ...productCompletionEvidence(state),
    {
      contract: CODE_EMPLOYEE_COMPLETION_CONTRACT,
      check: "employee-completion",
      complete: completion.complete === true,
      deterministic_verification_passed: completion.verified === true,
      final_diff_observed: completion.final_diff_observed === true,
      worldclass_quality_verified:
        object(completion.worldclass_quality).verified === true,
      product_completion_verified:
        object(completion.product_completion_criteria).required !== true ||
        object(completion.product_completion_criteria).verified === true,
      passed: completion.complete === true,
      status: completion.complete === true ? "verified" : "incomplete",
    },
  ];
  return evidence.filter((entry) => entry.passed === true).slice(0, MAX_ITEMS);
}

function failureEvidence(state) {
  return list(state?.failures)
    .slice(-20)
    .map((entry) => {
      const source = object(entry);
      const failure = text(source.message || source.reason, 1400);
      if (!failure) return null;
      return {
        failure,
        mission_completed_after_repair: true,
        operation_id: text(source.operation_id, 240) || null,
        action: text(source.action, 120) || null,
      };
    })
    .filter(Boolean);
}

function testEvidence(state) {
  const values = [];
  for (const entry of successfulVerificationEvidence(state)) {
    if (entry.command) {
      values.push([entry.command, ...entry.args].join(" ").trim());
    } else if (entry.check) {
      values.push(entry.check);
    }
  }
  return strings(values, 40, 1500);
}

function crossSystemConsequences(systemReasoning) {
  const source = object(systemReasoning);
  return strings([
    ...list(source.data_lifecycle_implications),
    ...list(source.security_permissions),
    ...list(source.business_accounting_invariants),
    ...list(source.integration_implications),
    ...list(source.backward_compatibility),
    ...list(source.performance_implications),
    ...list(source.reporting_analytics_implications),
    ...list(source.automation_ai_hooks),
  ], 50, 1800);
}

function completionEligibility({ missionContext, codeResult }) {
  const completion = object(codeResult?.employee_completion);
  const state = object(codeResult?.state);
  const productCompletion = object(completion.product_completion_criteria);
  const worldClass = object(completion.worldclass_quality);
  const expectedHead = text(missionContext?.repository_context?.head_sha, 160);
  const executedHead = text(state.base_commit, 160);
  const verification = successfulVerificationEvidence(state);
  const diff = finalDiffEvidence(state);
  const blockers = [];

  if (text(codeResult?.contract || codeResult?.employee_runtime_contract, 200) !==
      CODE_EMPLOYEE_RUNTIME_CONTRACT) {
    blockers.push("CODE_EMPLOYEE_RUNTIME_CONTRACT_REQUIRED");
  }
  if (codeResult?.success !== true || text(codeResult?.status, 80) !== "completed") {
    blockers.push("CODE_EMPLOYEE_SUCCESSFUL_COMPLETION_REQUIRED");
  }
  if (text(completion.contract, 200) !== CODE_EMPLOYEE_COMPLETION_CONTRACT) {
    blockers.push("CODE_EMPLOYEE_COMPLETION_CONTRACT_REQUIRED");
  }
  if (completion.complete !== true) blockers.push("CODE_EMPLOYEE_COMPLETE_REQUIRED");
  if (completion.verified !== true) blockers.push("DETERMINISTIC_VERIFICATION_REQUIRED");
  if (completion.final_diff_observed !== true) blockers.push("FINAL_DIFF_REQUIRED");
  if (completion.low_level_completed !== true) blockers.push("LOW_LEVEL_COMPLETION_REQUIRED");
  if (worldClass.verified !== true) blockers.push("WORLD_CLASS_QUALITY_VERIFICATION_REQUIRED");
  if (productCompletion.required === true && productCompletion.verified !== true) {
    blockers.push("PRODUCT_COMPLETION_CRITERIA_VERIFICATION_REQUIRED");
  }
  if (!verification.length) blockers.push("STRUCTURAL_VERIFICATION_EVIDENCE_REQUIRED");
  if (!diff.length) blockers.push("STRUCTURAL_FINAL_DIFF_EVIDENCE_REQUIRED");
  if (!sameHead(expectedHead, executedHead)) {
    blockers.push("MISSION_REPOSITORY_HEAD_MISMATCH");
  }

  return {
    eligible: blockers.length === 0,
    blockers,
    expected_repository_head: expectedHead || null,
    executed_repository_head: executedHead || null,
    verification_count: verification.length,
    final_diff_count: diff.length,
  };
}

function reusableKnowledge(missionContext) {
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
    .slice(0, 20);
}

export function buildAvantiqoVerifiedCodeMissionKnowledgeUtilityObservation({
  mission_context,
  code_result,
} = {}) {
  const missionContext = object(mission_context);
  const eligibility = completionEligibility({ missionContext, codeResult: code_result });
  if (!eligibility.eligible) {
    return {
      contract: AVANTIQO_CODE_MISSION_KNOWLEDGE_UTILITY_FEEDBACK_CONTRACT,
      applicable: false,
      status: "NOT_ELIGIBLE_CODE_RESULT_NOT_VERIFIED_COMPLETE",
      blockers: eligibility.blockers,
      observation_key: null,
      decision: null,
      execution: null,
    };
  }

  const knowledge = reusableKnowledge(missionContext);
  if (!knowledge.length) {
    return {
      contract: AVANTIQO_CODE_MISSION_KNOWLEDGE_UTILITY_FEEDBACK_CONTRACT,
      applicable: false,
      status: "NOT_APPLICABLE_NO_REUSED_KNOWLEDGE",
      blockers: [],
      observation_key: null,
      decision: null,
      execution: null,
    };
  }

  const missionId = text(missionContext.mission?.id, 240);
  const repositoryHead = text(code_result?.state?.base_commit, 160).toLowerCase();
  if (!missionId || !repositoryHead) {
    throw new Error("AVANTIQO_CODE_MISSION_KNOWLEDGE_UTILITY_LINEAGE_REQUIRED");
  }

  return {
    contract: AVANTIQO_CODE_MISSION_KNOWLEDGE_UTILITY_FEEDBACK_CONTRACT,
    applicable: true,
    status: "READY_FOR_OBSERVATIONAL_UTILITY_FEEDBACK",
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
    execution: {
      status: "completed",
      capability: {
        key: CODE_CAPABILITY_KEY,
        mode: "write",
      },
      post_action_verification: {
        status: "completed",
        verification_source: "CODE_EMPLOYEE_STRUCTURAL_COMPLETION",
      },
    },
    governance: {
      verified_code_completion_required: true,
      explicit_reused_knowledge_required: true,
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

async function recordVerifiedCodeMissionKnowledgeUtility({
  mission_context,
  code_result,
  database = null,
  recorder = null,
} = {}) {
  const projected = buildAvantiqoVerifiedCodeMissionKnowledgeUtilityObservation({
    mission_context,
    code_result,
  });
  if (!projected.applicable) {
    return {
      contract: AVANTIQO_CODE_MISSION_KNOWLEDGE_UTILITY_FEEDBACK_CONTRACT,
      status: projected.status,
      written: false,
      applicable: false,
      failure_reason: null,
      governance: projected.governance || {
        relationship: "OBSERVATIONAL_ASSOCIATION_ONLY",
        causal_attribution_allowed: false,
        authorization_effect: "NONE",
      },
    };
  }

  const record = typeof recorder === "function" ? recorder : defaultRecordKnowledgeUtility;
  try {
    const result = await record({
      decision: projected.decision,
      evidence: {
        mission_contract: AVANTIQO_INTELLIGENCE_CODE_MISSION_CONTRACT,
        verified_repository_head: text(code_result?.state?.base_commit, 160),
      },
      execution: projected.execution,
      observation_key: projected.observation_key,
      database,
    });
    return {
      contract: AVANTIQO_CODE_MISSION_KNOWLEDGE_UTILITY_FEEDBACK_CONTRACT,
      status: result?.written === true
        ? "OBSERVATIONAL_UTILITY_FEEDBACK_RECORDED"
        : `OBSERVATIONAL_UTILITY_FEEDBACK_${text(result?.reason, 160) || "NOT_WRITTEN"}`,
      written: result?.written === true,
      applicable: true,
      idempotent_observation: result?.idempotent_observation === true,
      memory_key: text(result?.memory_key, 240) || null,
      receipt_fingerprint: text(result?.receipt_fingerprint, 120) || null,
      failure_reason: null,
      governance: {
        ...object(projected.governance),
        observational_association_only: true,
        causal_attribution_allowed: false,
        automatic_knowledge_promotion: false,
        automatic_training_effect: "NONE",
      },
    };
  } catch (error) {
    return {
      contract: AVANTIQO_CODE_MISSION_KNOWLEDGE_UTILITY_FEEDBACK_CONTRACT,
      status: "OBSERVATIONAL_UTILITY_FEEDBACK_FAILED",
      written: false,
      applicable: true,
      failure_reason: text(error?.message || error, 500),
      governance: {
        ...object(projected.governance),
        observational_association_only: true,
        causal_attribution_allowed: false,
        verified_code_result_remains_valid: true,
        learning_candidate_handoff_remains_independent: true,
        automatic_knowledge_promotion: false,
        automatic_training_effect: "NONE",
      },
    };
  }
}

export function buildAvantiqoVerifiedCodeMissionLearningFeedback({
  mission_context,
  code_result,
} = {}) {
  const missionContext = object(mission_context);
  if (text(missionContext.contract, 200) !== AVANTIQO_INTELLIGENCE_CODE_MISSION_CONTRACT) {
    throw new Error("AVANTIQO_CODE_MISSION_LEARNING_HANDOFF_MISSION_CONTRACT_INVALID");
  }
  if (text(missionContext.status, 120) !== "READY_FOR_CODE") {
    throw new Error("AVANTIQO_CODE_MISSION_LEARNING_HANDOFF_MISSION_NOT_READY");
  }

  const eligibility = completionEligibility({ missionContext, codeResult: code_result });
  if (!eligibility.eligible) {
    return {
      success: true,
      contract: AVANTIQO_CODE_MISSION_LEARNING_HANDOFF_CONTRACT,
      status: "NOT_ELIGIBLE_CODE_RESULT_NOT_VERIFIED_COMPLETE",
      eligible_for_learning_feedback: false,
      blockers: eligibility.blockers,
      repository: {
        expected_head: eligibility.expected_repository_head,
        executed_head: eligibility.executed_repository_head,
      },
      feedback: null,
      governance: {
        model_call_performed: false,
        provider_call_performed: false,
        supabase_write_performed: false,
        runpod_job_submitted: false,
        automatic_knowledge_promotion: false,
        trusted_knowledge_written: false,
      },
    };
  }

  const state = object(code_result?.state);
  const completion = object(code_result?.employee_completion);
  const systemReasoning = object(missionContext.system_reasoning);
  const verifiedResult = {
    verified: true,
    repository_head_verified: text(state.base_commit, 160),
    verification_evidence: verificationEvidence(code_result),
  };
  const feedback = createAvantiqoCodeMissionLearningFeedback({
    mission_context: missionContext,
    verified_result: verifiedResult,
    learning: {
      problem: text(missionContext.mission?.objective, 6000),
      architecture_chosen:
        text(systemReasoning.architecture_recommendation, 6000) || null,
      dependencies_discovered: strings(systemReasoning.shared_primitives, 40, 1200),
      affected_domains: strings(systemReasoning.affected_domains, 40, 300),
      affected_capabilities: strings(systemReasoning.affected_capabilities, 80, 500),
      files_components_involved: strings(completion.files_changed, 80, 1000),
      tests_that_mattered: testEvidence(state),
      failure_repair_relationships: failureEvidence(state),
      cross_system_consequences: crossSystemConsequences(systemReasoning),
      boundary_conditions: strings([
        ...list(systemReasoning.invariants),
        ...list(systemReasoning.future_predictable_requirements),
      ], 50, 1800),
      approaches_that_did_not_work: strings(
        list(state.failures).map((entry) => object(entry).message || object(entry).reason),
        30,
        1600,
      ),
    },
  });

  return {
    success: true,
    contract: AVANTIQO_CODE_MISSION_LEARNING_HANDOFF_CONTRACT,
    status: feedback.eligible_for_learning_review === true
      ? "VERIFIED_CODE_LEARNING_FEEDBACK_READY"
      : "NOT_ELIGIBLE_FEEDBACK_REJECTED",
    eligible_for_learning_feedback: feedback.eligible_for_learning_review === true,
    blockers: [],
    repository: {
      expected_head: eligibility.expected_repository_head,
      executed_head: eligibility.executed_repository_head,
      matched: true,
    },
    verification_evidence_count: verifiedResult.verification_evidence.length,
    feedback,
    governance: {
      model_call_performed: false,
      provider_call_performed: false,
      supabase_write_performed: false,
      runpod_job_submitted: false,
      source_code_persisted_to_learning: false,
      raw_patch_persisted_to_learning: false,
      raw_reasoning_persisted: false,
      automatic_knowledge_promotion: false,
      trusted_knowledge_written: false,
      authorization_effect: "NONE",
    },
  };
}

export async function handoffVerifiedCodeMissionToLearning({
  mission_context,
  code_result,
  persist = true,
  database = null,
  organization_id = null,
  knowledge_utility_recorder = null,
} = {}) {
  const prepared = buildAvantiqoVerifiedCodeMissionLearningFeedback({
    mission_context,
    code_result,
  });
  if (!prepared.eligible_for_learning_feedback || !persist) {
    return {
      ...prepared,
      status: prepared.eligible_for_learning_feedback && !persist
        ? "VERIFIED_CODE_LEARNING_FEEDBACK_PREVIEW"
        : prepared.status,
      persisted: false,
      knowledge_utility: {
        contract: AVANTIQO_CODE_MISSION_KNOWLEDGE_UTILITY_FEEDBACK_CONTRACT,
        status: persist
          ? "NOT_ELIGIBLE_CODE_RESULT_NOT_VERIFIED_COMPLETE"
          : "PREVIEW_NO_UTILITY_WRITE",
        written: false,
      },
    };
  }

  const ingress = await ingestAvantiqoCodeMissionLearningFeedback({
    feedback: prepared.feedback,
    organization_id,
    database,
  });
  const knowledgeUtility = await recordVerifiedCodeMissionKnowledgeUtility({
    mission_context,
    code_result,
    database,
    recorder: knowledge_utility_recorder,
  });

  return {
    ...prepared,
    status: ingress.status === "EVIDENCE_CANDIDATE_INGESTED"
      ? "VERIFIED_CODE_LEARNING_HANDOFF_COMPLETE"
      : `VERIFIED_CODE_LEARNING_HANDOFF_${text(ingress.status, 120) || "UNKNOWN"}`,
    persisted: ingress.evidence_candidate_written === true,
    evidence_candidate_written: ingress.evidence_candidate_written === true,
    reusable_platform_knowledge_written: false,
    next_stage_contract: ingress.next_stage_contract ||
      "AVANTIQO_LEARNING_EVIDENCE_CANDIDATE_BRIDGE_V1",
    ingress: {
      contract: ingress.contract || null,
      status: ingress.status || null,
      memory_scope: ingress.memory_scope || null,
      memory_key: ingress.memory_key || null,
      reason: ingress.reason || null,
    },
    knowledge_utility: knowledgeUtility,
    governance: {
      ...prepared.governance,
      supabase_write_performed:
        ingress.evidence_candidate_written === true || knowledgeUtility.written === true,
      evidence_candidate_write_only: true,
      knowledge_utility_observation_write: knowledgeUtility.written === true,
      knowledge_utility_is_observational_only: true,
      knowledge_utility_causal_attribution_allowed: false,
      reusable_platform_knowledge_written: false,
      automatic_knowledge_promotion: false,
      trusted_knowledge_written: false,
    },
  };
}

export const AvantiqoCodeMissionLearningHandoffRuntime = Object.freeze({
  contract: AVANTIQO_CODE_MISSION_LEARNING_HANDOFF_CONTRACT,
  knowledge_utility_contract: AVANTIQO_CODE_MISSION_KNOWLEDGE_UTILITY_FEEDBACK_CONTRACT,
  buildFeedback: buildAvantiqoVerifiedCodeMissionLearningFeedback,
  buildKnowledgeUtilityObservation: buildAvantiqoVerifiedCodeMissionKnowledgeUtilityObservation,
  handoff: handoffVerifiedCodeMissionToLearning,
});

export default AvantiqoCodeMissionLearningHandoffRuntime;
