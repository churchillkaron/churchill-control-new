import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  resolveBusinessPartnerDiagnosis,
} from "../lib/operator/runtime/BusinessPartnerDiagnosisResolutionPolicy.mjs";

const supervisor = await readFile(
  "lib/operator/runtime/OperatorRepairSupervisionRuntime.js",
  "utf8",
);
const synthetic = await readFile(
  "lib/operator/runtime/SyntheticIntelligenceTurnRuntime.js",
  "utf8",
);

const base = {
  initial_classification: "DIAGNOSIS_REQUIRED",
  relevant_live_read_evidence_observed: true,
  exact_business_identity_evidence_matched: true,
};

test("diagnosis stays unresolved without relevant current live evidence", () => {
  const result = resolveBusinessPartnerDiagnosis({
    ...base,
    relevant_live_read_evidence_observed: false,
    repair: { diagnosis: "CONFIG_MISSING" },
  });
  assert.equal(result.status, "MORE_EVIDENCE_REQUIRED");
  assert.equal(result.resolved_classification, "DIAGNOSIS_REQUIRED");
  assert.equal(result.code_engineering_candidate, false);
});
test("diagnosis resolves only into existing deterministic recovery lanes", () => {
  const cases = [
    ["MISSING_RECORD", "DATA_OR_CLARIFICATION"],
    ["OAUTH_RECONNECT_REQUIRED", "CONFIGURATION_OR_EXTERNAL"],
    ["NETWORK_TIMEOUT", "TRANSIENT_RUNTIME"],
  ];
  for (const [diagnosis, expected] of cases) {
    const result = resolveBusinessPartnerDiagnosis({
      ...base,
      repair: { diagnosis, repairable: true },
    });
    assert.equal(result.status, "RESOLVED");
    assert.equal(result.resolved_classification, expected);
    assert.equal(result.code_engineering_candidate, false);
    assert.equal(result.authorization_effect, "NONE");
  }
});

test("diagnosis-based product defect promotion requires exact identity evidence", () => {
  const denied = resolveBusinessPartnerDiagnosis({
    ...base,
    exact_business_identity_evidence_matched: false,
    repair: { diagnosis: "INVARIANT_VIOLATION", repairable: true },
  });
  assert.equal(denied.resolved_classification, "DIAGNOSIS_REQUIRED");
  assert.equal(denied.code_engineering_candidate, false);

  const allowed = resolveBusinessPartnerDiagnosis({
    ...base,
    repair: { diagnosis: "INVARIANT_VIOLATION", repairable: true },
  });
  assert.equal(allowed.resolved_classification, "PRODUCT_DEFECT_CANDIDATE");
  assert.equal(allowed.code_engineering_candidate, true);
});
test("supervisor reclassifies only after server live-read assessment", () => {
  assert.match(supervisor, /assessOperatorRepairLiveReadEvidence/);
  assert.match(supervisor, /resolveBusinessPartnerDiagnosis/);
  assert.match(supervisor, /resolvedRecoveryClassification/);
  assert.match(supervisor, /initial_recovery_classification/);
  assert.match(supervisor, /diagnosis_resolution/);
});

test("resolved data blockers ask one precise human question without mutation", () => {
  assert.match(synthetic, /dataClarificationQuestion/);
  assert.match(synthetic, /recovery_classification === "DATA_OR_CLARIFICATION"/);
  assert.match(synthetic, /needs_human === true/);
  assert.match(synthetic, /clarification: \{ required: true, question: dataClarificationQuestion, options: \[\] \}/);
  assert.match(synthetic, /execution_governance_bypassed: false/);
});
