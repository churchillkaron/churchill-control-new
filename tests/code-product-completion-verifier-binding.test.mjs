import assert from "node:assert/strict";
import test from "node:test";
import { projectCodeProductCompletionCriteria } from "../lib/code/runtime/CodeProductCompletionCriteriaRuntime.js";

function stateWith(testCommand, testArgs) {
  return {
    objective: "Run npm test after the repair.",
    objective_context: {
      authoritative_verification_command: "node",
      authoritative_verification_args: ["--test", "tests/exact.test.mjs"],
      completion_criterion_1: "The exact command node --test tests/exact.test.mjs passes.",
    },
    completed_operation_ids: ["verify_1"],
    evidence: [{
      kind: "operation",
      operation_id: "verify_1",
      action: "verify",
      status: "completed",
      description: "verification",
    }],
    verification: [{ operation_id: "verify_1", passed: true }],
    tests: [{
      operation_id: "verify_1",
      command: testCommand,
      args: testArgs,
      exit_code: 0,
    }],
  };
}

test("product completion uses canonical structured verifier binding", () => {
  const projection = projectCodeProductCompletionCriteria(
    stateWith("node", ["--test", "tests/exact.test.mjs"]),
  );
  assert.equal(projection.authoritative_verification_source, "STRUCTURED_OBJECTIVE_CONTEXT");
  assert.deepEqual(projection.authoritative_verification_operation_ids, ["verify_1"]);
  assert.equal(projection.verified, true);
});

test("a different passing command cannot satisfy structured completion verifier", () => {
  const projection = projectCodeProductCompletionCriteria(
    stateWith("npm", ["test"]),
  );
  assert.equal(projection.authoritative_verification_source, "STRUCTURED_OBJECTIVE_CONTEXT");
  assert.deepEqual(projection.authoritative_verification_operation_ids, []);
  assert.equal(projection.verified, false);
});
