import { createHash } from "node:crypto";
import { collectStableBusinessIdentities } from "./OperatorDeterministicBusinessEffectRuntime.js";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function list(value) {
  return Array.isArray(value) ? value : [];
}
function capabilitySurface(key) {
  return text(key, 300).toLowerCase().split(".").slice(0, 2).join(".");
}
function stableIdentityFingerprints(value) {
  return new Set(
    [...collectStableBusinessIdentities(value)]
      .slice(0, 50)
      .map((identity) => createHash("sha256").update(identity).digest("hex")),
  );
}

export function assessOperatorRepairLiveReadEvidence(
  supervised = {},
  result = {},
  serverLiveReadReceipts = [],
  expectedScope = {},
) {
  const phases = object(supervised.phases);
  const execution = object(result.execution);
  const recovery = object(result?.agreement_state?.business_partner_recovery);
  const failedCapabilityKey = text(execution.capability?.key, 300);
  const verificationCapabilityKey = text(execution.post_action_verification?.capability_key, 300);
  const failedSurface = capabilitySurface(failedCapabilityKey);
  const failedIdentityFingerprints = stableIdentityFingerprints(recovery.payload);
  const calls = [phases.reason_act_observe, phases.critique_repair]
    .flatMap((phase) => list(object(phase).transcript))
    .flatMap((turn) => list(object(turn).tool_calls));
  const successful = calls.filter((call) =>
    text(call?.name, 120) === "operator_live_read" &&
    text(call?.outcome, 80).toLowerCase() === "succeeded"
  );
  const relevantKeys = new Set(successful.map((call) =>
    text(call?.invocation_identity?.capability_key, 300)
  ).filter((readKey) => {
    if (!readKey) return false;
    if (verificationCapabilityKey) return readKey === verificationCapabilityKey;
    return Boolean(failedSurface) && capabilitySurface(readKey) === failedSurface;
  }));
  const scopedReceipts = list(serverLiveReadReceipts).filter((receipt) => {
    const readKey = text(receipt?.capability_key, 300);
    if (!relevantKeys.has(readKey)) return false;
    const scopePairs = [
      [receipt?.organization_id, expectedScope.organization_id, true],
      [receipt?.entity_id, expectedScope.entity_id, false],
      [receipt?.period_id, expectedScope.period_id, false],
      [receipt?.party_id, expectedScope.party_id, false],
    ];
    for (const [actual, expected, required] of scopePairs) {
      const expectedValue = text(expected, 160);
      const actualValue = text(actual, 160);
      if (required && !expectedValue) return false;
      if (expectedValue && actualValue !== expectedValue) return false;
    }
    return text(receipt?.status, 80).toLowerCase() === "completed";
  });
  const identityMatchedReceipts = failedIdentityFingerprints.size
    ? scopedReceipts.filter((receipt) =>
        list(receipt?.stable_business_identity_fingerprints).some((fingerprint) =>
          failedIdentityFingerprints.has(text(fingerprint, 128))
        )
      )
    : scopedReceipts;
  return {
    observed: successful.length > 0,
    relevant_observed: relevantKeys.size > 0,
    identity_required: failedIdentityFingerprints.size > 0,
    identity_matched: identityMatchedReceipts.length > 0,
    successful_call_count: successful.length,
    relevant_successful_call_count: relevantKeys.size,
    scoped_receipt_count: scopedReceipts.length,
    identity_matched_receipt_count: identityMatchedReceipts.length,
    verification_capability_key: verificationCapabilityKey || null,
    failed_capability_surface: failedSurface || null,
  };
}

export const OperatorRepairLiveReadEvidenceRuntime = Object.freeze({
  assess: assessOperatorRepairLiveReadEvidence,
});
