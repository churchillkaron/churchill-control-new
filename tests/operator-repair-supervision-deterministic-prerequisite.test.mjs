import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyOperatorFailureRecovery,
  evaluateOperatorRepairSupervision,
  operatorRepairHasDeterministicConfigurationPrerequisite,
} from "../lib/operator/runtime/OperatorRepairSupervisionPolicy.js";

function schemaBlockedResult() {
  return {
    execution: {
      status: "blocked",
      reason: "PRODUCT_IMPLEMENTATION_REPAIR_PENDING_ACTIVATION",
      capability: { key: "supply_chain.stock_movements.create" },
      implementation_repair: {
        attempted: true,
        repaired_and_resumed: false,
        engineering_result: {
          status: "blocked",
          mission: {
            status: "blocked",
            reason: "OPERATOR_MISSION_DISPATCH_SCHEMA_REQUIRED",
            failure_evidence: {
              error_code: "OPERATOR_MISSION_DISPATCH_SCHEMA_REQUIRED",
            },
          },
        },
      },
    },
  };
}

test("known mission schema prerequisite bypasses redundant model repair supervision", () => {
  const result = schemaBlockedResult();
  assert.equal(operatorRepairHasDeterministicConfigurationPrerequisite(result), true);
  assert.deepEqual(classifyOperatorFailureRecovery(result), {
    classification: "CONFIGURATION_OR_EXTERNAL",
    code_engineering_candidate: false,
  });
  assert.deepEqual(evaluateOperatorRepairSupervision(result), {
    applicable: false,
    reason: "DETERMINISTIC_CONFIGURATION_PREREQUISITE",
    failure_reason: "PRODUCT_IMPLEMENTATION_REPAIR_PENDING_ACTIVATION",
    execution_failed: true,
    verification_failed: false,
  });
});

test("unknown blocked failures still require normal supervision", () => {
  const result = { execution: { status: "blocked", reason: "SOMETHING_UNCLASSIFIED" } };
  assert.equal(operatorRepairHasDeterministicConfigurationPrerequisite(result), false);
  assert.equal(evaluateOperatorRepairSupervision(result).applicable, true);
});
