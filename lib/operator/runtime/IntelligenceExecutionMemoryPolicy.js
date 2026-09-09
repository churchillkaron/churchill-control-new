function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export function validCognitiveVerificationAttestation(verification = {}) {
  const attestation = object(verification.cognitive_verification_attestation);
  if (!Object.keys(attestation).length) return null;
  const valid =
    text(attestation.contract, 160) ===
      "AVANTIQO_COGNITIVE_MUTATION_VERIFICATION_ATTESTATION_V1" &&
    Boolean(text(attestation.plan_id, 300)) &&
    Boolean(text(attestation.step_id, 300)) &&
    Boolean(text(attestation.capability_key, 300)) &&
    /^[a-f0-9]{64}$/.test(text(attestation.payload_fingerprint, 128)) &&
    Boolean(text(object(attestation.execution_scope).organization_id, 300)) &&
    text(attestation.verification_capability_key, 300) ===
      text(verification.capability_key, 300) &&
    attestation.business_effect_verified === true &&
    object(attestation.assertion).passed === true &&
    text(attestation.authorization_effect, 80) === "NONE";
  return valid ? attestation : null;
}

export function executionMemoryVerificationState(execution = {}) {
  const current = object(execution);
  const status = text(current.status, 80).toLowerCase();
  const mode = text(current?.capability?.mode, 80).toLowerCase();
  const verification = object(current.post_action_verification);
  const verificationStatus = text(verification.status, 80).toLowerCase();
  const assertionPassed = object(verification.assertion).passed === true;
  const deterministicVerified =
    verification.business_effect_verified === true && assertionPassed;
  const cognitiveAttestation = validCognitiveVerificationAttestation(verification);
  const cognitiveBound = Boolean(verification.cognitive_execution_binding_required);
  const cognitiveAuditReceiptId = text(
    verification.cognitive_verification_audit_receipt_id,
    300,
  );
  const cognitiveCapabilityMatches =
    !cognitiveBound ||
    text(cognitiveAttestation?.capability_key, 300) ===
      text(current?.capability?.key, 300);
  const mutating = Boolean(mode && mode !== "read");

  if (status !== "completed") {
    return {
      completed: false,
      mutating,
      verification_present: Boolean(verificationStatus),
      verification_status: verificationStatus || null,
      business_effect_verified: false,
    };
  }

  if (!mutating) {
    return {
      completed: true,
      mutating: false,
      verification_present: Boolean(verificationStatus),
      verification_status: verificationStatus || null,
      business_effect_verified: true,
    };
  }

  return {
    completed: true,
    mutating: true,
    verification_present: Boolean(verificationStatus),
    verification_status: verificationStatus || null,
    business_effect_verified:
      deterministicVerified &&
      (!cognitiveBound ||
        (Boolean(cognitiveAttestation) &&
          cognitiveCapabilityMatches &&
          Boolean(cognitiveAuditReceiptId))),
    cognitive_binding_required: cognitiveBound,
    cognitive_verification_attested: Boolean(cognitiveAttestation),
    cognitive_verification_provenance: cognitiveAttestation
      ? {
          contract: text(cognitiveAttestation.contract, 160),
          plan_id: text(cognitiveAttestation.plan_id, 300),
          step_id: text(cognitiveAttestation.step_id, 300),
          capability_key: text(cognitiveAttestation.capability_key, 300),
          payload_fingerprint: text(cognitiveAttestation.payload_fingerprint, 128),
          execution_scope: object(cognitiveAttestation.execution_scope),
          verification_capability_key: text(cognitiveAttestation.verification_capability_key, 300),
          audit_receipt_id: cognitiveAuditReceiptId,
          authorization_effect: "NONE",
        }
      : null,
  };
}

export function shouldLearnCompletedExecutionMemory(execution = {}) {
  const state = executionMemoryVerificationState(execution);
  if (!state.completed) return false;
  if (!state.mutating) return true;
  return state.business_effect_verified === true;
}

export function shouldRetireExecutionBlockerMemory(execution = {}) {
  const state = executionMemoryVerificationState(execution);
  if (!state.completed) return false;
  if (!state.mutating) return true;
  return state.business_effect_verified === true;
}

export const IntelligenceExecutionMemoryPolicy = Object.freeze({
  verificationState: executionMemoryVerificationState,
  learnCompleted: shouldLearnCompletedExecutionMemory,
  retireBlockers: shouldRetireExecutionBlockerMemory,
});
