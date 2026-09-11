import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { assessBusinessPartnerAmbiguousWriteOutcome } from "../lib/operator/runtime/BusinessPartnerAmbiguousWriteRecoveryRuntime.mjs";

const synthetic = await readFile("lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js", "utf8");
const core = await readFile("lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8");

const verifier = { key: "finance.invoice_status.read", mode: "read" };

function outcome(state, extra = {}) {
  return { business_effect_outcome: { state, authoritative_server_evidence: true, exact_business_scope_matched: true, ...extra } };
}

test("authoritative completed outcome never permits mutation replay", () => {
  const result = assessBusinessPartnerAmbiguousWriteOutcome({
    verifier,
    result: outcome("COMPLETED", { business_effect_observed: true }),
  });
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.business_effect_verified, true);
  assert.equal(result.mutation_replay_allowed, false);
  assert.equal(result.authorization_effect, "NONE");
});

test("authoritative non-completion can only request fresh governed retry", () => {
  const result = assessBusinessPartnerAmbiguousWriteOutcome({
    verifier,
    result: outcome("NOT_COMPLETED", { business_effect_absent: true, safe_to_retry: true }),
  });
  assert.equal(result.status, "NOT_COMPLETED");
  assert.equal(result.mutation_replay_allowed, true);
  assert.equal(result.retry_requires_fresh_governance, true);
  assert.equal(result.authorization_effect, "SAME_ACTION_ONLY");
});
test("missing authority or exact scope remains uncertain", () => {
  for (const result of [
    { business_effect_outcome: { state: "COMPLETED", business_effect_observed: true } },
    { business_effect_outcome: { state: "NOT_COMPLETED", authoritative_server_evidence: true, business_effect_absent: true, safe_to_retry: true } },
  ]) {
    const assessed = assessBusinessPartnerAmbiguousWriteOutcome({ verifier, result });
    assert.equal(assessed.status, "UNCERTAIN");
    assert.equal(assessed.mutation_replay_allowed, false);
  }
});

test("read verifier is mandatory", () => {
  const assessed = assessBusinessPartnerAmbiguousWriteOutcome({
    verifier: { key: "finance.invoice.create", mode: "write" },
    result: outcome("NOT_COMPLETED", { business_effect_absent: true, safe_to_retry: true }),
  });
  assert.equal(assessed.status, "UNCERTAIN");
  assert.equal(assessed.reason, "REGISTERED_READ_VERIFIER_REQUIRED");
});

test("synthetic runtime reinspects only transient writes marked for reinspection", () => {
  assert.match(synthetic, /WRITE_OUTCOME_REINSPECTION_REQUIRED/);
  assert.match(synthetic, /AVANTIQO_BUSINESS_PARTNER_AMBIGUOUS_WRITE_REINSPECTION/);
  assert.match(synthetic, /item\.key === capabilityKey && item\.mode === "read"/);
  assert.match(synthetic, /\["COMPLETED", "NOT_COMPLETED"\]\.includes/);
});

test("completed ambiguous write resumes mission without replay", () => {
  assert.match(core, /recovery_completed_without_replay:\s*true/);
  assert.match(core, /businessPartnerAmbiguousWriteMissionResume:\s*true/);
  assert.match(core, /mutationReplayPerformed:\s*false/);
  assert.match(core, /businessPartnerMissionContinuation\(/);
});

test("not-completed retry remains exact action and fresh governance", () => {
  assert.match(core, /Retry exact original action after authoritative reinspection proved it did not complete/);
  assert.match(core, /ambiguousWriteNotCompleted/);
  assert.match(core, /executionBlockedReason\(capability, \{ source, confirmed: false \}\)/);
});