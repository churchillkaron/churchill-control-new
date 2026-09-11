import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  classifyBusinessPartnerTransientRecovery,
} from "../lib/operator/runtime/BusinessPartnerTransientRecoveryPolicy.mjs";

const synthetic = await readFile(
  "lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js",
  "utf8",
);
const core = await readFile(
  "lib/operator/runtime/OperatorTurnRuntimeCore.js",
  "utf8",
);

test("transient read failures allow one exact automatic retry", () => {
  const result = classifyBusinessPartnerTransientRecovery({
    classification: "TRANSIENT_RUNTIME",
    reason: "HTTP_TIMEOUT 503",
    repair: { needs_human: false, retry_policy: "safe_reinspect_then_retry" },
    recovery: { capability: { mode: "read" } },
  });
  assert.equal(result.status, "READY_TO_RETRY");
  assert.equal(result.auto_resume_allowed, true);
  assert.equal(result.read_only_retry, true);
  assert.equal(result.authorization_effect, "SAME_ACTION_ONLY");
});
test("transient mission reads can retry from failure phase evidence", () => {
  const result = classifyBusinessPartnerTransientRecovery({
    classification: "TRANSIENT_RUNTIME",
    reason: "ECONNRESET",
    repair: { needs_human: false, retry_policy: "safe_reinspect_then_retry" },
    recovery: { capability: {}, failure_evidence: { phase: "read" } },
  });
  assert.equal(result.status, "READY_TO_RETRY");
  assert.equal(result.auto_resume_allowed, true);
});

test("transient writes require outcome reinspection and never auto replay", () => {
  for (const recovery of [
    { capability: { mode: "execute" } },
    { capability: {}, failure_evidence: { phase: "action", mutation_completion_proven: false } },
  ]) {
    const result = classifyBusinessPartnerTransientRecovery({
      classification: "TRANSIENT_RUNTIME",
      reason: "NETWORK_TIMEOUT",
      repair: { needs_human: false, retry_policy: "safe_reinspect_then_retry" },
      recovery,
    });
    assert.equal(result.status, "WRITE_OUTCOME_REINSPECTION_REQUIRED");
    assert.equal(result.auto_resume_allowed, false);
    assert.equal(result.authorization_effect, "NONE");
  }
});
test("transient retry stays one shot and separate from Code replay", () => {
  assert.match(synthetic, /transient_auto_retry_attempted:\s*true/);
  assert.match(synthetic, /transient_auto_retry_single_attempt:\s*true/);
  assert.match(core, /Retry exact original read after transient runtime failure/);
  assert.match(core, /transientRecovery\.read_only_retry === true/);
  assert.match(core, /if \(!configurationRecoveryResume\)/);
  assert.match(core, /if \(!transientRecoveryResume\)/);
  assert.match(core, /transient_recovery_receipt/);
  assert.match(core, /businessPartnerTransientMissionResume:\s*true/);
  assert.match(core, /businessPartnerSelfHealingMissionResume:\s*true/);
});

test("mission recovery preserves phase evidence for retry safety", () => {
  assert.match(core, /failure_evidence:\s*evidence/);
  assert.match(core, /businessPartnerMissionContinuation\(/);
});