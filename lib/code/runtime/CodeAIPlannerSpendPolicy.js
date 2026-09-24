export const CODE_AI_PLANNER_SPEND_POLICY_CONTRACT =
  "AVANTIQO_CODE_AI_PLANNER_SPEND_POLICY_V1";

export const DEFAULT_CODE_AI_REASONING_CALL_BUDGET = 4;
export const MAX_CODE_AI_REASONING_CALL_BUDGET = 8;
export const MAX_CODE_AI_LOCAL_REASONING_CALL_BUDGET = 32;

function integer(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

export function resolveCodeAIReasoningCallBudget(value, {
  max_budget = MAX_CODE_AI_REASONING_CALL_BUDGET,
} = {}) {
  const parsed = integer(value);
  const requestedMax = integer(max_budget);
  const effectiveMax = requestedMax && requestedMax > 0
    ? Math.min(MAX_CODE_AI_LOCAL_REASONING_CALL_BUDGET, requestedMax)
    : MAX_CODE_AI_REASONING_CALL_BUDGET;
  if (!parsed || parsed <= 0) return DEFAULT_CODE_AI_REASONING_CALL_BUDGET;
  return Math.min(effectiveMax, parsed);
}

export function assertCodeAIReasoningCallAllowed({
  call_number,
  budget,
  max_budget = MAX_CODE_AI_REASONING_CALL_BUDGET,
} = {}) {
  const callNumber = integer(call_number);
  if (!callNumber || callNumber <= 0) {
    throw new Error("CODE_AI_REASONING_CALL_NUMBER_REQUIRED");
  }
  const resolvedBudget = resolveCodeAIReasoningCallBudget(budget, { max_budget });
  if (callNumber > resolvedBudget) {
    throw new Error(
      `CODE_AI_REASONING_CALL_BUDGET_EXHAUSTED:${callNumber}:${resolvedBudget}`,
    );
  }
  return {
    contract: CODE_AI_PLANNER_SPEND_POLICY_CONTRACT,
    call_number: callNumber,
    reasoning_call_budget: resolvedBudget,
    remaining_after_submission: Math.max(0, resolvedBudget - callNumber),
    allowed: true,
  };
}

export const CodeAIPlannerSpendPolicy = Object.freeze({
  contract: CODE_AI_PLANNER_SPEND_POLICY_CONTRACT,
  default_reasoning_call_budget: DEFAULT_CODE_AI_REASONING_CALL_BUDGET,
  max_reasoning_call_budget: MAX_CODE_AI_REASONING_CALL_BUDGET,
  max_local_reasoning_call_budget: MAX_CODE_AI_LOCAL_REASONING_CALL_BUDGET,
  resolve: resolveCodeAIReasoningCallBudget,
  assertAllowed: assertCodeAIReasoningCallAllowed,
});
