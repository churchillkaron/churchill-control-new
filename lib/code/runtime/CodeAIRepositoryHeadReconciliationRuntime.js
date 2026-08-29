export const CODE_AI_REPOSITORY_HEAD_RECONCILIATION_CONTRACT =
  "AVANTIQO_CODE_AI_REPOSITORY_HEAD_RECONCILIATION_V1";

function text(value, maximum = 12000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function fullHead(value) {
  return /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(text(value, 160).toLowerCase());
}

export function reconcileCodeAIRepositoryHeadBeforeMutation({
  expected_head = null,
  actual_head = null,
} = {}) {
  const expected = text(expected_head, 160).toLowerCase();
  const actual = text(actual_head, 160).toLowerCase();

  if (!expected) {
    return {
      success: true,
      contract: CODE_AI_REPOSITORY_HEAD_RECONCILIATION_CONTRACT,
      status: "NOT_REQUESTED",
      matched: null,
      expected_head: null,
      actual_head: actual || null,
      mutation_allowed_by_this_guard: true,
      authorization_effect: "NONE",
    };
  }
  if (!fullHead(expected)) {
    throw new Error("CODE_AI_REPOSITORY_HEAD_EXPECTED_FULL_SHA_REQUIRED");
  }
  if (!fullHead(actual)) {
    throw new Error("CODE_AI_REPOSITORY_HEAD_ACTUAL_FULL_SHA_REQUIRED");
  }
  if (expected !== actual) {
    const error = new Error("CODE_AI_REPOSITORY_HEAD_CHANGED_BEFORE_MUTATION");
    error.code = "CODE_AI_REPOSITORY_HEAD_CHANGED_BEFORE_MUTATION";
    error.expected_head = expected;
    error.actual_head = actual;
    throw error;
  }

  return {
    success: true,
    contract: CODE_AI_REPOSITORY_HEAD_RECONCILIATION_CONTRACT,
    status: "MATCHED",
    matched: true,
    expected_head: expected,
    actual_head: actual,
    mutation_allowed_by_this_guard: true,
    authorization_effect: "NONE",
  };
}

export const CodeAIRepositoryHeadReconciliationRuntime = Object.freeze({
  contract: CODE_AI_REPOSITORY_HEAD_RECONCILIATION_CONTRACT,
  reconcile: reconcileCodeAIRepositoryHeadBeforeMutation,
});

export default CodeAIRepositoryHeadReconciliationRuntime;
