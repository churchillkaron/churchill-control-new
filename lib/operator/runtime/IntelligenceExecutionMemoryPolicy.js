function text(value, limit = 1200) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

export function executionMemoryVerificationState(execution = {}) {
  const current = object(execution);
  const status = text(current.status, 80).toLowerCase();
  const mode = text(current?.capability?.mode, 80).toLowerCase();
  const verification = object(current.post_action_verification);
  const verificationStatus = text(verification.status, 80).toLowerCase();
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
    business_effect_verified: verificationStatus === "completed",
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
