import test from "node:test";
import assert from "node:assert/strict";

import {
  CODE_AI_CUSTOMER_ARTIFACT_CONTRACT,
  projectCodeAICustomerArtifact,
  renderCodeAICustomerArtifactText,
  findCodeAICustomerArtifact,
} from "../lib/code/runtime/CodeAICustomerArtifactRuntime.js";

function result({ verified = false, failedVerification = false } = {}) {
  return {
    success: verified,
    status: verified ? "completed" : "verification_required",
    reason: verified ? null : "CODE_AI_EMPLOYEE_VERIFICATION_REQUIRED",
    employee_completion: {
      complete: verified,
      verified,
      final_diff_observed: true,
      files_changed: ["lib/example.js"],
      blockers: verified ? [] : ["CODE_AI_EMPLOYEE_VERIFICATION_REQUIRED"],
    },
    state: {
      base_commit: "abc123",
      files_changed: ["lib/example.js"],
      source_changes: [{
        path: "lib/example.js",
        operation: "write",
        content: "export const fixed = true;\n",
      }],
      patch: "diff --git a/lib/example.js b/lib/example.js\n+export const fixed = true;\n",
      tests: [{
        operation_id: "verify_example",
        command: "node",
        args: ["--test", "tests/example.test.mjs"],
        exit_code: failedVerification ? 1 : 0,
      }],
      verification: [{
        operation_id: "verify_example",
        passed: !failedVerification,
      }],
      blockers: [],
    },
  };
}

test("projects a verified Code mission into a usable customer artifact", () => {
  const artifact = projectCodeAICustomerArtifact(result({ verified: true }));
  assert.equal(artifact.contract, CODE_AI_CUSTOMER_ARTIFACT_CONTRACT);
  assert.equal(artifact.available, true);
  assert.equal(artifact.verified_complete, true);
  assert.equal(artifact.commit_ready, true);
  assert.deepEqual(artifact.files_changed, ["lib/example.js"]);
  assert.match(artifact.patch, /export const fixed = true/);
  assert.equal(artifact.verification_passed_count, 1);
  assert.equal(artifact.verification_failed_count, 0);
});

test("preserves generated source when verification fails", () => {
  const artifact = projectCodeAICustomerArtifact(result({ failedVerification: true }));
  assert.equal(artifact.available, true);
  assert.equal(artifact.verified_complete, false);
  assert.equal(artifact.commit_ready, false);
  assert.equal(artifact.generated_source_preserved_when_unverified, true);
  assert.match(artifact.patch, /export const fixed = true/);
  assert.equal(artifact.verification_failed_count, 1);
  assert.ok(artifact.blockers.includes("CODE_AI_EMPLOYEE_VERIFICATION_REQUIRED"));

  const rendered = renderCodeAICustomerArtifactText(artifact);
  assert.match(rendered, /verification is not complete/i);
  assert.match(rendered, /lib\/example\.js/);
  assert.match(rendered, /```diff/);
});

test("finds a customer artifact through the Operator execution result nesting", () => {
  const artifact = projectCodeAICustomerArtifact(result({ verified: true }));
  const operator = {
    execution: {
      result: {
        result: {
          customer_artifact: artifact,
        },
      },
    },
  };
  assert.equal(findCodeAICustomerArtifact(operator), artifact);
});