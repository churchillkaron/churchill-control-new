import test from "node:test";
import assert from "node:assert/strict";

import {
  assessCodeAIBehavioralVerificationCoverage,
} from "../lib/code/runtime/CodeAIBehavioralVerificationRuntime.js";
import {
  assertCodeAIWorldClassCommitReady,
} from "../lib/code/runtime/CodeAIWorldClassCommitGuard.js";

function searchEvidence() {
  return [{
    kind: "operation",
    status: "completed",
    action: "search",
    result: {
      query: "AccessPolicy",
      matches: [
        "lib/auth/AccessPolicy.js:14:export function AccessPolicy() {}",
        "tests/auth/access-policy.test.js:7:import { AccessPolicy } from '../../lib/auth/AccessPolicy'",
        "app/api/admin/route.js:19:import { AccessPolicy } from '@/lib/auth/AccessPolicy'",
      ],
    },
  }];
}

function quality(operations) {
  const families = [...new Set(operations.map((operation) => operation.family))];
  return {
    contract: "AVANTIQO_CODE_AI_WORLDCLASS_QUALITY_V1",
    verified: true,
    blockers: [],
    risk: "standard",
    changed_file_count: 1,
    explicit_final_diff_review: true,
    source_manifest_matches_workspace: true,
    adversarial_diff_review: { verified: true },
    required_verification_gates: 1,
    fresh_verification_gate_count: operations.length,
    fresh_verification_family_count: families.length,
    fresh_verification_families: families,
    fresh_verification_operations: operations,
  };
}

function state(operations) {
  return {
    files_changed: ["lib/auth/AccessPolicy.js"],
    source_changes: [{
      path: "lib/auth/AccessPolicy.js",
      operation: "write",
      content: "export function AccessPolicy() { return true; }\n",
    }],
    evidence: searchEvidence(),
    worldclass_quality: quality(operations),
  };
}

function assessOperation(command, args) {
  const operations = [{
    operation_id: "verify_candidate",
    command,
    args,
    family: "tests",
  }];
  return assessCodeAIBehavioralVerificationCoverage({
    state: state(operations),
    quality: quality(operations),
  });
}

test("observed impacted test becomes a behavioral verification obligation", () => {
  const result = assessCodeAIBehavioralVerificationCoverage({
    state: state([]),
    quality: quality([]),
  });

  assert.equal(result.required, true);
  assert.equal(result.verified, false);
  assert.deepEqual(result.observed_impacted_test_paths, ["tests/auth/access-policy.test.js"]);
  assert.equal(result.enforcement_basis, "OBSERVED_RELATED_TEST_FROM_REPOSITORY_EVIDENCE");
});

test("an unrelated passing targeted test cannot satisfy impacted behavior coverage", () => {
  const operations = [{
    operation_id: "verify_unrelated",
    command: "node",
    args: ["--test", "tests/finance/invoice.test.js"],
    family: "tests",
  }];

  const result = assessCodeAIBehavioralVerificationCoverage({
    state: state(operations),
    quality: quality(operations),
  });
  assert.equal(result.required, true);
  assert.equal(result.verified, false);
  assert.equal(result.matched_impacted_test_count, 0);

  assert.throws(
    () => assertCodeAIWorldClassCommitReady(state(operations)),
    /CODE_AI_COMMIT_BEHAVIORAL_VERIFICATION_REQUIRED/,
  );
});

test("the discovered related test satisfies the behavioral obligation", () => {
  const operations = [{
    operation_id: "verify_related",
    command: "node",
    args: ["--test", "tests/auth/access-policy.test.js"],
    family: "tests",
  }];

  const result = assessCodeAIBehavioralVerificationCoverage({
    state: state(operations),
    quality: quality(operations),
  });
  assert.equal(result.required, true);
  assert.equal(result.verified, true);
  assert.deepEqual(result.matched_impacted_test_paths, ["tests/auth/access-policy.test.js"]);

  const committed = assertCodeAIWorldClassCommitReady(state(operations));
  assert.equal(committed.success, true);
  assert.equal(committed.behavioral_verification_required, true);
  assert.equal(committed.behavioral_verification_verified, true);
  assert.equal(committed.behavioral_verification_matched_test_count, 1);
});

test("a broad repository test suite also satisfies observed impacted behavior coverage", () => {
  const operations = [{
    operation_id: "verify_suite",
    command: "npm",
    args: ["test"],
    family: "tests",
  }];

  const result = assessCodeAIBehavioralVerificationCoverage({
    state: state(operations),
    quality: quality(operations),
  });
  assert.equal(result.required, true);
  assert.equal(result.verified, true);
  assert.deepEqual(result.broad_test_operation_ids, ["verify_suite"]);
  assert.equal(result.broad_test_classification, "STRICT_REPOSITORY_SCOPE");
});

test("scoped package test scripts are not misclassified as broad proof", () => {
  const result = assessOperation("npm", ["run", "test:unit"]);
  assert.equal(result.required, true);
  assert.equal(result.verified, false);
  assert.deepEqual(result.broad_test_operation_ids, []);
});

test("scoped node test globs are not misclassified as broad proof", () => {
  const result = assessOperation("node", ["--test", "tests/finance/*.test.js"]);
  assert.equal(result.required, true);
  assert.equal(result.verified, false);
  assert.deepEqual(result.broad_test_operation_ids, []);
});

test("filtered pytest is not misclassified as broad proof", () => {
  const result = assessOperation("pytest", ["-k", "access_policy"]);
  assert.equal(result.required, true);
  assert.equal(result.verified, false);
  assert.deepEqual(result.broad_test_operation_ids, []);
});

test("package-scoped cargo tests are not misclassified as broad proof", () => {
  const result = assessOperation("cargo", ["test", "-p", "auth"]);
  assert.equal(result.required, true);
  assert.equal(result.verified, false);
  assert.deepEqual(result.broad_test_operation_ids, []);
});

test("no discovered related test does not invent a behavioral obligation", () => {
  const operations = [{
    operation_id: "verify_syntax",
    command: "node",
    args: ["--check", "lib/example.js"],
    family: "syntax",
  }];
  const noImpactState = {
    files_changed: ["lib/example.js"],
    source_changes: [{ path: "lib/example.js", operation: "write", content: "export default true;\n" }],
    evidence: [],
  };
  const result = assessCodeAIBehavioralVerificationCoverage({
    state: noImpactState,
    quality: quality(operations),
  });
  assert.equal(result.required, false);
  assert.equal(result.verified, true);
  assert.equal(result.observed_impacted_test_count, 0);
});
