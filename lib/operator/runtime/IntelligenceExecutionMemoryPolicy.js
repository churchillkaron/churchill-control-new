function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function validCognitiveVerificationAttestation(verification = {}) {
  const attestation = object(verification.cognitive_verification_attestation);
  if (!Object.keys(attestation).length) return null;
  const valid =
    text(attestation.contract, 160) ===
      "AVANTIQO_COGNITIVE_MUTATION_VERIFICATION_ATTESTATION_V1" &&
    Boolean(text(attestation.plan_id, 300)) &&
    Boolean(text(attestation.step_id, 300)) &&
    Boolean(text(attestation.capability_key, 300)) &&
    Boolean(text(attestation.payload_fingerprint, 128)) &&
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
      deterministicVerified && (!cognitiveBound || Boolean(cognitiveAttestation)),
    cognitive_binding_required: cognitiveBound,
    cognitive_verification_attested: Boolean(cognitiveAttestation),
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
