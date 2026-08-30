import test from "node:test";
import assert from "node:assert/strict";

import {
  assertCodeAIWorldClassCommitReady,
  CodeAIWorldClassCommitGuard,
} from "../lib/code/runtime/CodeAIWorldClassCommitGuard.js";

function quality(overrides = {}) {
  return {
    contract: "AVANTIQO_CODE_AI_WORLDCLASS_QUALITY_V1",
    verified: true,
    blockers: [],
    changed_file_count: 1,
    explicit_final_diff_review: true,
    source_manifest_matches_workspace: true,
    adversarial_diff_review: { verified: true },
    risk: "standard",
    required_verification_gates: 1,
    fresh_verification_gate_count: 1,
    fresh_verification_family_count: 1,
    fresh_verification_families: ["syntax"],
    ...overrides,
  };
}

test("standard-risk changes may use a single structural verification family", () => {
  const result = assertCodeAIWorldClassCommitReady({
    worldclass_quality: quality(),
  });

  assert.equal(result.success, true);
  assert.equal(result.substantive_verification_required, false);
  assert.equal(result.substantive_verification_family_count, 0);
});

test("high-risk commits cannot pass with syntax and git hygiene alone", () => {
  assert.throws(
    () => assertCodeAIWorldClassCommitReady({
      worldclass_quality: quality({
        risk: "high",
        required_verification_gates: 2,
        fresh_verification_gate_count: 2,
        fresh_verification_family_count: 2,
        fresh_verification_families: ["syntax", "command:git"],
      }),
    }),
    /CODE_AI_COMMIT_WORLDCLASS_SUBSTANTIVE_VERIFICATION_REQUIRED:risk=high/,
  );
});

test("critical-risk commits cannot substitute lint and syntax for substantive proof", () => {
  assert.throws(
    () => assertCodeAIWorldClassCommitReady({
      worldclass_quality: quality({
        risk: "critical",
        required_verification_gates: 3,
        fresh_verification_gate_count: 3,
        fresh_verification_family_count: 3,
        fresh_verification_families: ["syntax", "lint", "command:git"],
      }),
    }),
    /CODE_AI_COMMIT_WORLDCLASS_SUBSTANTIVE_VERIFICATION_REQUIRED:risk=critical/,
  );
});

test("guard advertises the substantive verification families it accepts", () => {
  assert.deepEqual(
    [...CodeAIWorldClassCommitGuard.substantive_verification_families].sort(),
    ["audit", "build", "tests", "typecheck"],
  );
});
