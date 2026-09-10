import {
  resolveCodeAIParallelSpecialistReviewNeed,
  CODE_AI_PARALLEL_SPECIALIST_REVIEW_CONTRACT,
} from "./CodeAIParallelSpecialistReviewRuntime.js";

export const CODE_AI_STRATEGIC_REVIEW_GATE_CONTRACT =
  "AVANTIQO_CODE_AI_STRATEGIC_REVIEW_GATE_V1";

function text(value, maximum = 12000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function assessCodeAIStrategicReviewGate(state = {}) {
  const source = object(state);
  const review = object(source.parallel_specialist_review);
  const need = resolveCodeAIParallelSpecialistReviewNeed({
    objective: text(source.objective || source?.employee_mission?.owner_intent, 9000),
    repository_impact: {
      ...object(source.repository_impact),
      risk: text(source?.repository_impact?.risk || source?.worldclass_quality?.risk, 80) || "unknown",
    },
    external_research: object(source.strategic_external_research),
  });

  if (!need.required) {
    return {
      contract: CODE_AI_STRATEGIC_REVIEW_GATE_CONTRACT,
      required: false,
      verified: true,
      need,
      blockers: [],
      authorization_effect: "NONE",
    };
  }

  const correctContract =
    text(review.contract, 200) === CODE_AI_PARALLEL_SPECIALIST_REVIEW_CONTRACT;
  const complete = review.completed === true && text(review.status, 80) === "COMPLETED";
  const bothRoles =
    review.architecture_performance_review_present === true &&
    review.adversarial_risk_review_present === true &&
    Number(review.reviewer_count_succeeded || 0) >= 2;
  const verified = correctContract && complete && bothRoles;

  return {
    contract: CODE_AI_STRATEGIC_REVIEW_GATE_CONTRACT,
    required: true,
    verified,
    need,
    review_contract_valid: correctContract,
    review_status: text(review.status, 80) || null,
    architecture_performance_review_present:
      review.architecture_performance_review_present === true,
    adversarial_risk_review_present: review.adversarial_risk_review_present === true,
    reviewer_count_succeeded: Number(review.reviewer_count_succeeded || 0),
    blockers: verified ? [] : ["CODE_AI_EMPLOYEE_STRATEGIC_REVIEW_REQUIRED"],
    authorization_effect: "NONE",
  };
}

export const CodeAIStrategicReviewGateRuntime = Object.freeze({
  contract: CODE_AI_STRATEGIC_REVIEW_GATE_CONTRACT,
  assess: assessCodeAIStrategicReviewGate,
});

export default CodeAIStrategicReviewGateRuntime;
