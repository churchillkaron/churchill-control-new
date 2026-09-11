import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  normalizeAuthoritativeBusinessEffectOutcome,
} from "../lib/operator/runtime/BusinessEffectOutcomeRuntime.mjs";
import {
  assessBusinessPartnerAmbiguousWriteOutcome,
} from "../lib/operator/runtime/BusinessPartnerAmbiguousWriteRecoveryRuntime.mjs";

const core = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8");
const synthetic = fs.readFileSync("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", "utf8");

test("server-bound stable identity match proves completed business effect", () => {
  const outcome = normalizeAuthoritativeBusinessEffectOutcome({
    expected: { action_result: { invoice_id: "inv-123" } },
    result: { invoice: { invoice_id: "inv-123", status: "PAID" } },
    server_scope_bound: true,
  });
  assert.equal(outcome.state, "COMPLETED");
  assert.equal(outcome.authoritative_server_evidence, true);
  assert.equal(outcome.exact_business_scope_matched, true);
  assert.equal(outcome.business_effect_observed, true);
  assert.equal(outcome.safe_to_retry, false);
});
test("normalized string identity evidence also proves completion", () => {
  const outcome = normalizeAuthoritativeBusinessEffectOutcome({
    expected: { action_identity_evidence: ["payment_id:pay-7"] },
    result: { payment: { payment_id: "pay-7", status: "SETTLED" } },
    server_scope_bound: true,
  });
  assert.equal(outcome.state, "COMPLETED");
  assert.equal(outcome.matched_identity, "payment_id:pay-7");
});

test("identity match without server-bound scope is never authoritative completion", () => {
  const outcome = normalizeAuthoritativeBusinessEffectOutcome({
    expected: { action_identity_evidence: ["order_id:ord-1"] },
    result: { order_id: "ord-1" },
    server_scope_bound: false,
  });
  assert.equal(outcome.state, "UNCERTAIN");
  assert.equal(outcome.safe_to_retry, false);
});

test("contextual input identifiers cannot prove an ambiguous mutation completed", () => {
  const outcome = normalizeAuthoritativeBusinessEffectOutcome({
    expected: { customer_id: "customer-1", invoice_id: "invoice-1" },
    result: { invoice_id: "invoice-1", status: "OPEN" },
    server_scope_bound: true,
  });
  assert.equal(outcome.state, "UNCERTAIN");
  assert.equal(outcome.safe_to_retry, false);
});

test("empty or missing verifier result never implies safe non-completion", () => {
  for (const result of [{}, { rows: [] }, { result: null }]) {
    const outcome = normalizeAuthoritativeBusinessEffectOutcome({
      expected: { invoice_id: "inv-missing" }, result, server_scope_bound: true,
    });
    assert.equal(outcome.state, "UNCERTAIN");
    assert.equal(outcome.business_effect_absent, false);
    assert.equal(outcome.safe_to_retry, false);
  }
});
test("explicit safe absence remains the only automatic non-completion proof", () => {
  const outcome = normalizeAuthoritativeBusinessEffectOutcome({
    result: { business_effect_outcome: {
      state: "NOT_COMPLETED",
      authoritative_server_evidence: true,
      exact_business_scope_matched: true,
      business_effect_absent: true,
      safe_to_retry: true,
    } },
    server_scope_bound: true,
  });
  assert.equal(outcome.state, "NOT_COMPLETED");
  assert.equal(outcome.safe_to_retry, true);
});

test("ambiguous write recovery can derive completed from exact stable identity", () => {
  const recovery = assessBusinessPartnerAmbiguousWriteOutcome({
    verifier: { key: "finance.invoice.read", mode: "read" },
    expected: { action_identity_evidence: ["invoice_id:inv-123"] },
    result: { invoice: { invoice_id: "inv-123", status: "PAID" } },
    server_scope_bound: true,
  });
  assert.equal(recovery.status, "COMPLETED");
  assert.equal(recovery.business_effect_verified, true);
  assert.equal(recovery.mutation_replay_allowed, false);
});

test("normal post-action verification emits the same canonical business effect envelope", () => {
  assert.match(core, /normalizeAuthoritativeBusinessEffectOutcome/);
  assert.match(core, /business_effect_outcome:/);
  assert.match(core, /state:\s*"COMPLETED"/);
  assert.match(core, /safe_to_retry:\s*false/);
  assert.match(synthetic, /action_identity_evidence:\s*list\(recoveryState\.failure_evidence/);
  assert.match(synthetic, /server_scope_bound:\s*true/);
});