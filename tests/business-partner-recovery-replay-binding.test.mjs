import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildBusinessPartnerRecoveryReplayBinding,
  validateBusinessPartnerRecoveryReplayBinding,
} from "../lib/operator/runtime/BusinessPartnerRecoveryReplayBinding.js";

const context = {
  organizationId: "org-1",
  entityId: "entity-1",
  periodId: "period-1",
  partyId: "party-1",
};

function build(payload = { customer_id: "c-1", amount: 1250 }) {
  return buildBusinessPartnerRecoveryReplayBinding({
    ...context,
    capabilityKey: "finance.customer_invoices.create",
    payload,
  });
}

test("Business Partner recovery replay binding is canonical and exact-action scoped", () => {
  const left = build({ customer_id: "c-1", amount: 1250 });
  const right = build({ amount: 1250, customer_id: "c-1" });
  assert.equal(left.binding_sha256, right.binding_sha256);
  assert.equal(left.authorization_effect, "SAME_ACTION_ONLY");
  assert.equal(left.replay_attempted, false);
  assert.equal(validateBusinessPartnerRecoveryReplayBinding(left, {
    ...context,
    capabilityKey: "finance.customer_invoices.create",
    payload: { amount: 1250, customer_id: "c-1" },
  }).valid, true);
});

test("Business Partner recovery replay binding rejects context, capability and payload substitution", () => {
  const binding = build();
  assert.equal(validateBusinessPartnerRecoveryReplayBinding(binding, {
    ...context,
    entityId: "entity-2",
    capabilityKey: "finance.customer_invoices.create",
    payload: binding.payload,
  }).valid, false);
  assert.equal(validateBusinessPartnerRecoveryReplayBinding(binding, {
    ...context,
    capabilityKey: "finance.vendor_bills.create",
    payload: binding.payload,
  }).valid, false);
  assert.equal(validateBusinessPartnerRecoveryReplayBinding(binding, {
    ...context,
    capabilityKey: "finance.customer_invoices.create",
    payload: { ...binding.payload, amount: 1300 },
  }).valid, false);
});

test("Business Partner captures and revalidates replay binding across direct and mission recovery", async () => {
  const runtime = await readFile("lib/operator/runtime/OperatorTurnRuntime.js", "utf8");
  const core = await readFile("lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8");
  assert.match(runtime, /buildBusinessPartnerRecoveryReplayBinding/);
  assert.match(runtime, /replay_binding:\s*buildBusinessPartnerRecoveryReplayBinding/);
  assert.match(core, /replay_binding:\s*buildBusinessPartnerRecoveryReplayBinding/);
  assert.match(core, /validateBusinessPartnerRecoveryReplayBinding/);
  assert.match(core, /businessPartnerRecoveryResumeAction\(agreementState, currentBusinessContext\)/);
  assert.match(core, /replay_binding_verified:\s*exactReplayBindingVerified/);
  assert.match(core, /original_action_replayed:\s*exactReplayBindingVerified/);
  assert.match(core, /authoritativeBusinessOutcome\s*=\s*\n\s*exactReplayBindingVerified/);
});
