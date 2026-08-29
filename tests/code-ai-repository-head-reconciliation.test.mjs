import assert from "node:assert/strict";
import test from "node:test";

import {
  reconcileCodeAIRepositoryHeadBeforeMutation,
  CODE_AI_REPOSITORY_HEAD_RECONCILIATION_CONTRACT,
} from "../lib/code/runtime/CodeAIRepositoryHeadReconciliationRuntime.js";

const HEAD = "a".repeat(40);

test("repository-head reconciliation is optional for legacy Code missions", () => {
  const result = reconcileCodeAIRepositoryHeadBeforeMutation({
    actual_head: HEAD,
  });
  assert.equal(result.contract, CODE_AI_REPOSITORY_HEAD_RECONCILIATION_CONTRACT);
  assert.equal(result.status, "NOT_REQUESTED");
  assert.equal(result.matched, null);
  assert.equal(result.mutation_allowed_by_this_guard, true);
  assert.equal(result.authorization_effect, "NONE");
});

test("exact repository head match allows the existing Code path to continue", () => {
  const result = reconcileCodeAIRepositoryHeadBeforeMutation({
    expected_head: HEAD.toUpperCase(),
    actual_head: HEAD,
  });
  assert.equal(result.status, "MATCHED");
  assert.equal(result.matched, true);
  assert.equal(result.expected_head, HEAD);
  assert.equal(result.actual_head, HEAD);
  assert.equal(result.mutation_allowed_by_this_guard, true);
});

test("repository movement fails closed before Code mutation", () => {
  assert.throws(
    () => reconcileCodeAIRepositoryHeadBeforeMutation({
      expected_head: HEAD,
      actual_head: "b".repeat(40),
    }),
    (error) => {
      assert.equal(error.code, "CODE_AI_REPOSITORY_HEAD_CHANGED_BEFORE_MUTATION");
      assert.equal(error.expected_head, HEAD);
      assert.equal(error.actual_head, "b".repeat(40));
      return true;
    },
  );
});

test("repository reconciliation requires exact full SHAs when requested", () => {
  assert.throws(
    () => reconcileCodeAIRepositoryHeadBeforeMutation({
      expected_head: "abcdef1",
      actual_head: HEAD,
    }),
    /CODE_AI_REPOSITORY_HEAD_EXPECTED_FULL_SHA_REQUIRED/,
  );
  assert.throws(
    () => reconcileCodeAIRepositoryHeadBeforeMutation({
      expected_head: HEAD,
      actual_head: "abcdef1",
    }),
    /CODE_AI_REPOSITORY_HEAD_ACTUAL_FULL_SHA_REQUIRED/,
  );
});
