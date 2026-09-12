import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  deriveCodeAIContractRepairConstraints,
  formatCodeAIContractRepairConstraintsForObjective,
} from "../lib/code/runtime/CodeAIContractRepairConstraintRuntime.js";
import {
  isRepairableCodeAIWorkPackageMutationFailure,
  resolveCodeAIWorkPackageFailureStatus,
} from "../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js";

function contractFailure(violations) {
  return {
    message: "CODE_AI_OBSERVED_CONTRACT_VIOLATION:lib/orders/runtime.js#settleOrder",
    result: { violations },
  };
}

test("contract violation becomes precise deterministic repair constraints", () => {
  const result = deriveCodeAIContractRepairConstraints(contractFailure([
    { path: "lib/orders/runtime.js", kind: "OBSERVED_CALL_ARITY_INCOMPATIBLE", symbol: "settleOrder", observed_argument_count: 2 },
    { path: "lib/orders/runtime.js", kind: "OBSERVED_RETURN_FIELD_REMOVED", symbol: "settleOrder", field: "invoice_id" },
    { path: "lib/orders/runtime.js", kind: "BUSINESS_CONTEXT_INVARIANT_REMOVED", symbol: "settleOrder", key: "organization_id" },
  ]));
  assert.equal(result.required, true);
  assert.equal(result.constraint_count, 3);
  assert.match(result.constraints[0].requirement, /2 observed argument/);
  assert.match(result.constraints[1].requirement, /invoice_id/);
  assert.match(result.constraints[2].requirement, /organization_id/);
  const prompt = formatCodeAIContractRepairConstraintsForObjective(result);
  assert.match(prompt, /materially different repair/);
  assert.match(prompt, /settleOrder/);
});

test("contract mutation rejection is repairable rather than terminal", () => {
  const reason = "CODE_AI_OBSERVED_CONTRACT_VIOLATION:lib/orders/runtime.js#settleOrder";
  assert.equal(isRepairableCodeAIWorkPackageMutationFailure(reason), true);
  assert.equal(resolveCodeAIWorkPackageFailureStatus("blocked", reason), "repair_required");
});

test("ordinary diff repair remains supported without inventing contract constraints", () => {
  const result = deriveCodeAIContractRepairConstraints({
    message: "CODE_AI_DIFF_CHECK_FAILED_AFTER_EDIT",
    result: { diff_check: { exit_code: 1 } },
  });
  assert.equal(result.required, false);
  assert.equal(result.constraint_count, 0);
});

test("live planner binds contract constraints into next repair reasoning call", async () => {
  const source = await readFile("lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", "utf8");
  assert.match(source, /deriveCodeAIContractRepairConstraints\(sourceQualityFailure\)/);
  assert.match(source, /formatCodeAIContractRepairConstraintsForObjective\(contractRepairConstraints\)/);
  assert.match(source, /contract_repair_constraints: contractRepairConstraints/);
  assert.ok(
    source.indexOf("contractRepairConstraints.required") <
    source.indexOf("compact.latest_failed_verification", source.indexOf("const repairGuidance")),
  );
});
