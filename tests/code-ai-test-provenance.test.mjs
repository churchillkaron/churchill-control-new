import test from "node:test";
import assert from "node:assert/strict";

import {
  assessCodeAITestProvenance,
} from "../lib/code/runtime/CodeAITestProvenanceRuntime.js";
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
        "tests/auth/access-policy.integration.test.js:9:import { AccessPolicy } from '../../lib/auth/AccessPolicy'",
      ],
    },
  }];
}

function quality(operations, risk = "critical") {
  const families = [...new Set(operations.map((operation) => operation.family))];
  return {
    contract: "AVANTIQO_CODE_AI_WORLDCLASS_QUALITY_V1",
    verified: true,
    blockers: [],
    risk,
    changed_file_count: 2,
    explicit_final_diff_review: true,
    source_manifest_matches_workspace: true,
    adversarial_diff_review: { verified: true },
    required_verification_gates: risk === "critical" ? 3 : 2,
    fresh_verification_gate_count: Math.max(operations.length, risk === "critical" ? 3 : 2),
    fresh_verification_family_count: risk === "critical" ? 3 : 2,
    fresh_verification_families: risk === "critical"
      ? [...new Set([...families, "typecheck", "syntax"])].slice(0, 3)
      : [...new Set([...families, "typecheck"])].slice(0, 2),
    fresh_verification_operations: operations,
  };
}

function baseState({
  changedTests = ["tests/auth/access-policy.test.js"],
  operations = [],
  risk = "critical",
} = {}) {
  const sourceChanges = [
    {
      path: "lib/auth/AccessPolicy.js",
      operation: "write",
      content: "export function AccessPolicy() { return true; }\n",
    },
    ...changedTests.map((path) => ({
      path,
      operation: "write",
      content: "// changed test\n",
    })),
  ];
  const filesChanged = sourceChanges.map((item) => item.path);
  const q = quality(operations, risk);
  return {
    files_changed: filesChanged,
    source_changes: sourceChanges,
    evidence: searchEvidence(),
    worldclass_quality: q,
  };
}

test("critical source and test changes cannot self-certify only through the changed impacted test", () => {
  const operations = [{
    operation_id: "verify_changed_test",
    command: "node",
    args: ["--test", "tests/auth/access-policy.test.js"],
    family: "tests",
  }];
  const state = baseState({ operations });
  const provenance = assessCodeAITestProvenance({
    state,
    quality: state.worldclass_quality,
  });

  assert.equal(provenance.required, true);
  assert.equal(provenance.verified, false);
  assert.equal(provenance.trust_basis, "ONLY_MISSION_MODIFIED_TEST_PROOF");

  assert.throws(
    () => assertCodeAIWorldClassCommitReady(state),
    /CODE_AI_COMMIT_INDEPENDENT_TEST_PROVENANCE_REQUIRED/,
  );
});

test("unchanged observed related test supplies independent behavioral proof", () => {
  const operations = [{
    operation_id: "verify_unchanged_test",
    command: "node",
    args: ["--test", "tests/auth/access-policy.integration.test.js"],
    family: "tests",
  }];
  const state = baseState({ operations });
  const provenance = assessCodeAITestProvenance({
    state,
    quality: state.worldclass_quality,
  });

  assert.equal(provenance.required, true);
  assert.equal(provenance.verified, true);
  assert.equal(provenance.trust_basis, "UNCHANGED_OBSERVED_RELATED_TEST");
  assert.deepEqual(
    provenance.unchanged_matched_impacted_test_paths,
    ["tests/auth/access-policy.integration.test.js"],
  );
});

test("broad test suite supplies independent proof even when impacted focused test changed", () => {
  const operations = [{
    operation_id: "verify_suite",
    command: "npm",
    args: ["test"],
    family: "tests",
  }];
  const state = baseState({ operations });
  const provenance = assessCodeAITestProvenance({
    state,
    quality: state.worldclass_quality,
  });

  assert.equal(provenance.required, true);
  assert.equal(provenance.verified, true);
  assert.equal(provenance.trust_basis, "BROAD_SUITE");
});

test("standard-risk work is not over-blocked when source and focused test are developed together", () => {
  const operations = [{
    operation_id: "verify_changed_test",
    command: "node",
    args: ["--test", "tests/auth/access-policy.test.js"],
    family: "tests",
  }];
  const state = baseState({ operations, risk: "standard" });
  state.worldclass_quality.required_verification_gates = 1;
  state.worldclass_quality.fresh_verification_gate_count = 1;
  state.worldclass_quality.fresh_verification_family_count = 1;
  state.worldclass_quality.fresh_verification_families = ["tests"];

  const provenance = assessCodeAITestProvenance({
    state,
    quality: state.worldclass_quality,
  });
  assert.equal(provenance.required, false);
  assert.equal(provenance.verified, true);
});
