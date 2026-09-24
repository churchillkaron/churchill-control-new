import test from "node:test";
import assert from "node:assert/strict";

import {
  assessCodeAIWorldClassQuality,
} from "../lib/code/runtime/CodeAIWorldClassQualityPolicy.js";
import {
  codeAIFinalIndependentReviewFingerprint,
} from "../lib/code/runtime/CodeAIFinalIndependentReviewRuntime.js";

function operation(operation_id, action) {
  return {
    kind: "operation",
    operation_id,
    action,
    status: "completed",
  };
}

function stateWithBuilds(secondEnv) {
  return {
    status: "completed",
    base_commit: "a".repeat(40),
    files_changed: ["app/api/example/route.js"],
    source_changes: [{
      path: "app/api/example/route.js",
      operation: "write",
      content: "export async function GET(){return Response.json({ok:true});}\n",
    }],
    patch: "diff --git a/app/api/example/route.js b/app/api/example/route.js\n+changed\n",
    evidence: [
      operation("edit", "apply_files"),
      operation("build_a", "verify"),
      operation("build_b", "verify"),
      operation("diff", "diff"),
    ],
    tests: [
      {
        operation_id: "build_a",
        command: "npm",
        args: ["run", "build"],
        env: { AVANTIQO_NEXT_DIST_DIR: ".next-code-verify" },
        exit_code: 0,
      },
      {
        operation_id: "build_b",
        command: "npm",
        args: ["run", "build"],
        env: secondEnv,
        exit_code: 0,
      },
    ],
    verification: [
      { operation_id: "build_a", passed: true },
      { operation_id: "build_b", passed: true },
    ],
  };
}

test("world-class quality treats verifier environment as part of fresh verification identity", () => {
  const distinct = assessCodeAIWorldClassQuality(
    stateWithBuilds({ AVANTIQO_NEXT_DIST_DIR: ".next-code-verify" }),
  );
  assert.equal(distinct.fresh_verification_gate_count, 1);

  const changedEnvironment = assessCodeAIWorldClassQuality(
    stateWithBuilds({}),
  );
  assert.equal(changedEnvironment.fresh_verification_gate_count, 2);
});

test("final independent review fingerprint changes when verifier environment changes", () => {
  const isolated = stateWithBuilds({ AVANTIQO_NEXT_DIST_DIR: ".next-code-verify" });
  const plain = stateWithBuilds({});
  assert.notEqual(
    codeAIFinalIndependentReviewFingerprint(isolated),
    codeAIFinalIndependentReviewFingerprint(plain),
  );
});
