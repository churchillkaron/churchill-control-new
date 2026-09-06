import assert from "node:assert/strict";
import test from "node:test";

import {
  CODE_AI_COMMIT_RESULT_POLICY_CONTRACT,
  validateCodeAICommitResultBinding,
} from "../lib/code/runtime/CodeAICommitResultPolicyRuntime.mjs";

function artifact(overrides = {}) {
  return {
    found: true,
    row_id: "row-123",
    execution_key: "execution-key-123",
    commit_attempted: true,
    commit_attempt_count: 1,
    ...overrides,
  };
}

const COMMIT_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const COMMIT_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

test("binds exact successful commit to an attempted scoped artifact", () => {
  const result = validateCodeAICommitResultBinding({
    artifact: artifact(),
    commitSha: COMMIT_A,
  });

  assert.equal(result.contract, CODE_AI_COMMIT_RESULT_POLICY_CONTRACT);
  assert.equal(result.valid, true);
  assert.equal(result.committed_sha, COMMIT_A);
  assert.equal(result.idempotent, false);
  assert.equal(result.authorization_effect, "NONE");
  assert.equal(result.deploy_authority, false);
});

test("same commit result is idempotent", () => {
  const result = validateCodeAICommitResultBinding({
    artifact: artifact(),
    commitSha: COMMIT_A,
    existingCommitSha: COMMIT_A,
  });

  assert.equal(result.valid, true);
  assert.equal(result.idempotent, true);
});

test("conflicting second commit result is immutable", () => {
  assert.throws(
    () => validateCodeAICommitResultBinding({
      artifact: artifact(),
      commitSha: COMMIT_B,
      existingCommitSha: COMMIT_A,
    }),
    /CODE_AI_COMMIT_RESULT_IMMUTABLE/,
  );
});

test("result cannot exist before governed commit attempt", () => {
  assert.throws(
    () => validateCodeAICommitResultBinding({
      artifact: artifact({ commit_attempted: false, commit_attempt_count: 0 }),
      commitSha: COMMIT_A,
    }),
    /CODE_AI_COMMIT_RESULT_ATTEMPT_REQUIRED/,
  );
});

test("invalid commit identity fails closed", () => {
  assert.throws(
    () => validateCodeAICommitResultBinding({
      artifact: artifact(),
      commitSha: "main",
    }),
    /CODE_AI_COMMIT_RESULT_SHA_INVALID/,
  );
});

test("missing scoped artifact fails closed", () => {
  assert.throws(
    () => validateCodeAICommitResultBinding({
      artifact: artifact({ found: false }),
      commitSha: COMMIT_A,
    }),
    /CODE_AI_COMMIT_RESULT_ARTIFACT_REQUIRED/,
  );
});
