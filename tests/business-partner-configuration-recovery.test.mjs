import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  classifyBusinessPartnerConfigurationRecovery,
} from "../lib/operator/runtime/BusinessPartnerConfigurationRecoveryPolicy.mjs";

const synthetic = await readFile(
  "lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js",
  "utf8",
);
const core = await readFile(
  "lib/operator/runtime/OperatorTurnRuntimeCore.js",
  "utf8",
);

test("configuration recovery requires server-observed exact live-read evidence", () => {
  const base = {
    classification: "CONFIGURATION_OR_EXTERNAL",
    reason: "CONNECTION_REQUIRED",
    repair: {
      repairable: true,
      needs_human: false,
      retry_policy: "safe_reinspect_then_retry",
    },
  };
  assert.equal(
    classifyBusinessPartnerConfigurationRecovery(base).status,
    "REINSPECT_REQUIRED",
  );
  const ready = classifyBusinessPartnerConfigurationRecovery({
    ...base,
    relevant_live_read_evidence_observed: true,
    exact_business_identity_evidence_matched: true,
  });
  assert.equal(ready.status, "READY_TO_RETRY");
  assert.equal(ready.auto_resume_allowed, true);
  assert.equal(ready.authorization_effect, "SAME_ACTION_ONLY");
});

test("credentials governance and provider outages never auto retry", () => {
  for (const [reason, expected] of [
    ["OAUTH_RECONNECT_REQUIRED", "HUMAN_CREDENTIAL_REQUIRED"],
    ["QUOTA_EXCEEDED", "GOVERNANCE_REQUIRED"],
    ["PROVIDER_UNAVAILABLE", "EXTERNAL_DEPENDENCY_PENDING"],
  ]) {
    const result = classifyBusinessPartnerConfigurationRecovery({
      classification: "CONFIGURATION_OR_EXTERNAL",
      reason,
      repair: { repairable: true, needs_human: false, retry_policy: "safe_reinspect_then_retry" },
      relevant_live_read_evidence_observed: true,
      exact_business_identity_evidence_matched: true,
    });
    assert.equal(result.status, expected);
    assert.equal(result.auto_resume_allowed, false);
  }
});

test("configuration retry is one shot and keeps normal governance", () => {
  assert.match(synthetic, /configuration_auto_retry_attempted:\s*true/);
  assert.match(synthetic, /configuration_auto_retry_single_attempt:\s*true/);
  assert.match(synthetic, /message:\s*"continue"/);
  assert.match(synthetic, /source:\s*"event"/);
  assert.match(synthetic, /execution_governance_bypassed:\s*false/);
  assert.match(core, /Resume exact original action after verified configuration recovery/);
  assert.match(core, /authorization_effect\) !== "SAME_ACTION_ONLY"/);
});

test("configuration recovery bypasses Code replay verifier but not business verification", () => {
  assert.match(core, /if \(!configurationRecoveryResume\) \{/);
  assert.match(core, /verifyPlatformSelfHealingReplay\(/);
  assert.match(core, /configuration_recovery_receipt/);
  assert.match(core, /business_effect_verified:\s*true/);
  assert.match(core, /businessPartnerMissionContinuation\(/);
});
