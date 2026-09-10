import assert from "node:assert/strict";
import test from "node:test";

import {
  buildImplementationRepairResumeBinding,
  validateImplementationRepairResumeBinding,
} from "../lib/operator/runtime/OperatorImplementationRepairResumeBinding.js";

const context = {
  organizationId: "org-1",
  entityId: "entity-1",
  periodId: "period-1",
  partyId: "party-1",
};

function binding() {
  return buildImplementationRepairResumeBinding({
    ...context,
    capabilityKey: "finance.invoice.create",
    payload: { customer_id: "c-1", total: 2500 },
    reason: "Create the requested invoice",
    originalMessage: "create the invoice",
  });
}
test("exact business context validates the repaired-action continuation", () => {
  const result = validateImplementationRepairResumeBinding(binding(), context);
  assert.equal(result.valid, true);
});

test("organization or actor drift invalidates the continuation", () => {
  assert.equal(
    validateImplementationRepairResumeBinding(binding(), {
      ...context,
      organizationId: "org-2",
    }).valid,
    false,
  );
  assert.equal(
    validateImplementationRepairResumeBinding(binding(), {
      ...context,
      partyId: "party-2",
    }).valid,
    false,
  );
});

test("payload tampering invalidates the continuation", () => {
  const changed = binding();
  changed.payload.total = 9999;
  const result = validateImplementationRepairResumeBinding(changed, context);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "IMPLEMENTATION_REPAIR_RESUME_BINDING_MISMATCH");
});
test("old weak resume contracts fail closed", () => {
  const old = { ...binding(), contract: "AVANTIQO_IMPLEMENTATION_REPAIR_RESUME_V1" };
  const result = validateImplementationRepairResumeBinding(old, context);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "IMPLEMENTATION_REPAIR_RESUME_CONTRACT_INVALID");
});

test("already-attempted continuation cannot replay", () => {
  const attempted = binding();
  attempted.resume_attempted = true;
  const result = validateImplementationRepairResumeBinding(attempted, context);
  assert.equal(result.valid, false);
  assert.equal(result.reason, "IMPLEMENTATION_REPAIR_RESUME_ALREADY_ATTEMPTED");
});
