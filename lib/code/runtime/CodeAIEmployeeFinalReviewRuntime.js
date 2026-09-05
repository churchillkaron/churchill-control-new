import {
  executeCodeAIEmployeeMission as executeBaseCodeAIEmployeeMission,
  CodeAIEmployeeRuntime as BaseCodeAIEmployeeRuntime,
} from "./CodeAIEmployeeRuntime.js";
import {
  runCodeAIFinalIndependentReview,
  assessCodeAIFinalIndependentReviewGate,
  CODE_AI_FINAL_INDEPENDENT_REVIEW_CONTRACT,
} from "./CodeAIFinalIndependentReviewRuntime.js";
import {
  assessCodeAIWorldClassQuality,
} from "./CodeAIWorldClassQualityPolicy.js";
import {
  recordCodeAIEngineeringMemoryUtility,
  CODE_AI_ENGINEERING_MEMORY_UTILITY_CONTRACT,
} from "./CodeAIEngineeringMemoryUtilityRuntime.js";

export const CODE_AI_EMPLOYEE_FINAL_REVIEW_RUNTIME_CONTRACT =
  "AVANTIQO_CODE_AI_EMPLOYEE_FINAL_REVIEW_RUNTIME_V1";

const MAX_FINAL_REVIEW_REPAIR_CYCLES = 2;
const MAX_EVIDENCE_ITEMS = 120;

function text(value, maximum = 12000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function blockingReviewFindings(review = {}) {
  const findings = [];
  for (const reviewer of list(review?.reviews)) {
    if (reviewer?.verdict !== "repair_required") continue;
    for (const finding of list(reviewer?.findings)) {
      if (!["critical", "high"].includes(text(finding?.severity, 40).toLowerCase())) continue;
      findings.push({
        reviewer: text(reviewer?.role, 120) || null,
        severity: text(finding?.severity, 40).toLowerCase(),
        title: text(finding?.title, 500),
        evidence: text(finding?.evidence, 1200) || null,
        repair: text(finding?.repair, 1200) || null,
      });
    }
  }
  return findings.slice(0, 16);
}

function reviewRepairObjective(originalObjective, review) {
  const findings = blockingReviewFindings(review);
  if (!findings.length) return text(originalObjective, 7000);
  return [
    text(originalObjective, 7000),
    "INDEPENDENT FINAL PATCH REVIEW FOUND MATERIAL DEFECTS. Repair these exact evidence-backed issues; do not weaken tests, verification, contracts, security, or product criteria:",
    ...findings.map((finding, index) => [
      `${index + 1}. [${finding.severity}] ${finding.title}`,
      finding.evidence ? `evidence: ${finding.evidence}` : null,
      finding.repair ? `required correction: ${finding.repair}` : null,
    ].filter(Boolean).join(" | ")),
    "After repair, rerun the required deterministic verification and final diff. The independent review will be repeated against the new patch fingerprint.",
  ].join("\n");
}

function reopenForFinalReviewRepair(state, review, cycle) {
  const source = object(state);
  return {
    ...source,
    status: "review_required",
    blockers: ["CODE_AI_FINAL_INDEPENDENT_REVIEW_REPAIR_REQUIRED"],
    final_independent_review: review,
    current_operation_id: null,
    updated_at: new Date().toISOString(),
    evidence: [
      ...list(source.evidence),
      {
        at: new Date().toISOString(),
        kind: "final_independent_review_controller",
        contract: CODE_AI_EMPLOYEE_FINAL_REVIEW_RUNTIME_CONTRACT,
        status: "repair_required",
        repair_cycle: cycle,
        review_contract: CODE_AI_FINAL_INDEPENDENT_REVIEW_CONTRACT,
        review_status: text(review?.status, 80) || null,
        blocking_findings: blockingReviewFindings(review),
        provider_execution_submitted: false,
        source_mutation_performed: false,
        wallet_mutation_performed: false,
        authorization_effect: "NONE",
        raw_reasoning_persisted: false,
      },
    ].slice(-MAX_EVIDENCE_ITEMS),
  };
}

function attachReview(result, review, gate) {
  const source = object(result);
  const state = {
    ...object(source.state),
    final_independent_review: review,
    final_independent_review_gate: gate,
  };
  return {
    ...source,
    state,
    final_independent_review: review,
    final_independent_review_gate: gate,
    final_review_runtime_contract: CODE_AI_EMPLOYEE_FINAL_REVIEW_RUNTIME_CONTRACT,
  };
}

function finalReviewBlockedResult(result, review, gate, reason) {
  const attached = attachReview(result, review, gate);
  return {
    ...attached,
    success: false,
    status: "review_required",
    reason,
    state: {
      ...object(attached.state),
      status: "review_required",
      blockers: [reason],
    },
  };
}

async function finalResultWithEngineeringMemoryUtility(context, result) {
  const source = object(result);
  try {
    const utility = await recordCodeAIEngineeringMemoryUtility({ context, result: source });
    return {
      ...source,
      engineering_memory_utility: utility,
    };
  } catch (error) {
    console.error(JSON.stringify({
      event: "AVANTIQO_CODE_FINAL_ENGINEERING_MEMORY_UTILITY_RECORD_FAILED",
      mission_id: text(source?.state?.mission_id, 240) || null,
      reason: text(error?.message || error, 500),
      verified_code_result_changed: false,
      authorization_effect: "NONE",
    }));
    return {
      ...source,
      engineering_memory_utility: {
        contract: CODE_AI_ENGINEERING_MEMORY_UTILITY_CONTRACT,
        applicable: false,
        written: 0,
        observations: [],
        reason: "FINAL_UTILITY_RECORD_UNAVAILABLE",
        failure_reason: text(error?.message || error, 500) || null,
        verified_code_result_changed: false,
        authorization_effect: "NONE",
      },
    };
  }
}

export async function executeCodeAIEmployeeMission({
  context = {},
  objective,
  owner_intent = null,
  objective_context = null,
  repository_url,
  ref = "main",
  resume_state = null,
  reasoning_call_budget = null,
  max_employee_passes = null,
  timeout_ms = null,
} = {}) {
  const originalObjective = text(objective, 7000);
  let currentObjective = originalObjective;
  let currentState = resume_state;
  let latestResult = null;

  for (let cycle = 0; cycle <= MAX_FINAL_REVIEW_REPAIR_CYCLES; cycle += 1) {
    latestResult = await executeBaseCodeAIEmployeeMission({
      context,
      objective: currentObjective,
      owner_intent: owner_intent || originalObjective,
      objective_context,
      repository_url,
      ref,
      resume_state: currentState,
      reasoning_call_budget,
      ...(max_employee_passes == null ? {} : { max_employee_passes }),
      timeout_ms,
    });

    if (
      latestResult?.success !== true ||
      text(latestResult?.status, 100) !== "completed" ||
      !latestResult?.state
    ) {
      return {
        ...object(latestResult),
        final_review_runtime_contract: CODE_AI_EMPLOYEE_FINAL_REVIEW_RUNTIME_CONTRACT,
      };
    }

    const state = object(latestResult.state);
    const quality = assessCodeAIWorldClassQuality(state);
    const preGate = assessCodeAIFinalIndependentReviewGate(state, quality);
    if (!preGate.required) {
      const reviewed = attachReview(latestResult, {
        contract: CODE_AI_FINAL_INDEPENDENT_REVIEW_CONTRACT,
        status: "NOT_REQUIRED",
        required: false,
        verified: true,
        risk: quality.risk,
        required_approvals: 0,
        approved_review_count: 0,
        blocking_finding_count: 0,
        reviews: [],
        specialist_reasoning_calls_requested: 0,
        source_mutation_authority: false,
        authorization_effect: "NONE",
        raw_reasoning_persisted: false,
      }, preGate);
      return finalResultWithEngineeringMemoryUtility(context, reviewed);
    }

    const review = await runCodeAIFinalIndependentReview({
      context,
      objective: originalObjective,
      state,
      existing: state.final_independent_review || null,
    });
    const reviewedState = { ...state, final_independent_review: review };
    const gate = assessCodeAIFinalIndependentReviewGate(reviewedState, quality);
    const attached = attachReview({ ...latestResult, state: reviewedState }, review, gate);
    if (gate.verified === true) {
      const completed = {
        ...attached,
        success: true,
        status: "completed",
        reason: null,
        state: {
          ...object(attached.state),
          status: "completed",
          blockers: [],
        },
      };
      return finalResultWithEngineeringMemoryUtility(context, completed);
    }

    if (review.status !== "REPAIR_REQUIRED") {
      return finalReviewBlockedResult(
        attached,
        review,
        gate,
        gate.blocker || "CODE_AI_FINAL_INDEPENDENT_REVIEW_UNAVAILABLE",
      );
    }

    if (cycle >= MAX_FINAL_REVIEW_REPAIR_CYCLES) {
      return finalReviewBlockedResult(
        attached,
        review,
        gate,
        `CODE_AI_FINAL_INDEPENDENT_REVIEW_REPAIR_CYCLE_EXHAUSTED:${MAX_FINAL_REVIEW_REPAIR_CYCLES}`,
      );
    }

    currentState = reopenForFinalReviewRepair(reviewedState, review, cycle + 1);
    currentObjective = reviewRepairObjective(originalObjective, review);
  }

  return {
    ...object(latestResult),
    success: false,
    status: "review_required",
    reason: "CODE_AI_FINAL_INDEPENDENT_REVIEW_UNRESOLVED",
    final_review_runtime_contract: CODE_AI_EMPLOYEE_FINAL_REVIEW_RUNTIME_CONTRACT,
  };
}

export const CodeAIEmployeeRuntime = Object.freeze({
  ...BaseCodeAIEmployeeRuntime,
  contract: BaseCodeAIEmployeeRuntime.contract,
  final_review_runtime_contract: CODE_AI_EMPLOYEE_FINAL_REVIEW_RUNTIME_CONTRACT,
  final_review_contract: CODE_AI_FINAL_INDEPENDENT_REVIEW_CONTRACT,
  final_review_repair_cycles: MAX_FINAL_REVIEW_REPAIR_CYCLES,
  engineering_memory_utility_contract: CODE_AI_ENGINEERING_MEMORY_UTILITY_CONTRACT,
  final_engineering_memory_utility_recording: true,
  engineering_memory_utility_failure_blocks_verified_code: false,
  execute: executeCodeAIEmployeeMission,
});

export default CodeAIEmployeeRuntime;
