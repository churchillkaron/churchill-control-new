import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { classifyOperatorFailureRecovery } from "../lib/operator/runtime/OperatorRepairSupervisionPolicy.js";

const turn = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntime.js", "utf8");
const core = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8");
const repair = fs.readFileSync("lib/operator/runtime/OperatorRepairSupervisionRuntime.js", "utf8");

function failed({ code = "RUNTIME_FAILURE", status = null, reason = "OPERATOR_DELEGATED_EXECUTION_FAILED" } = {}) {
  return { execution: { status: "failed", reason, failure_evidence: { error_code: code, status_code: status } } };
}

test("all governed capability exceptions retain exact capability identity before recovery", () => {
  assert.match(core, /executionError\.operatorCapability = \{[\s\S]*key: capability\.key,[\s\S]*domain: capability\.domain,[\s\S]*action: capability\.action/);
  assert.match(turn, /delegatedFailureTurn\(effectiveOptions, error\)/);
  assert.match(turn, /AVANTIQO_OPERATOR_DELEGATED_FAILURE_EVIDENCE_V1/);
  assert.match(turn, /original_goal_preserved: true/);
  assert.match(turn, /raw_error_returned_to_user: false/);
});

test("recovery routing separates missing truth, dependencies, transient faults and product defects", () => {
  assert.equal(classifyOperatorFailureRecovery(failed({ code: "INVALID_INPUT", status: 422 })).classification, "DATA_OR_CLARIFICATION");
  assert.equal(classifyOperatorFailureRecovery(failed({ code: "OAUTH_CONNECTION_REQUIRED" })).classification, "CONFIGURATION_OR_EXTERNAL");
  assert.equal(classifyOperatorFailureRecovery(failed({ code: "HTTP_TIMEOUT", status: 503 })).classification, "TRANSIENT_RUNTIME");
  const defect = classifyOperatorFailureRecovery(failed({ code: "FINANCE_POSTING_RUNTIME_FAILURE", status: 500 }));
  assert.equal(defect.classification, "PRODUCT_DEFECT_CANDIDATE");
  assert.equal(defect.code_engineering_candidate, true);
});

test("verification failure remains read-repair first and never becomes automatic code mutation authority", () => {
  const result = { execution: { status: "completed", post_action_verification: { status: "failed", reason: "READBACK_MISMATCH" } } };
  const classified = classifyOperatorFailureRecovery(result);
  assert.equal(classified.classification, "VERIFICATION_ONLY");
  assert.equal(classified.code_engineering_candidate, false);
});

test("owned repair Intelligence receives the deterministic routing guard", () => {
  assert.match(repair, /recovery_classification/);
  assert.match(repair, /PRODUCT_DEFECT_CANDIDATE may recommend governed Product Engineering/);
  assert.match(repair, /code_engineering_candidate/);
  assert.match(repair, /Do not retry or execute writes in this phase/);
});
