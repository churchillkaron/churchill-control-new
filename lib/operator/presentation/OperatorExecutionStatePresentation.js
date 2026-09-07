const CODE_COMMIT_CAPABILITY_KEY = "platform.code_ai_commit.execute";
const CODE_COMMIT_VERIFY_CAPABILITY_KEY = "platform.code_ai_commit_status.verify";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

export function pendingCodeCommitIntent(pendingExecution = {}) {
  const pending = object(pendingExecution);
  const payload = object(pending.payload);
  const resume = object(payload.resume);
  const steps = list(payload.steps);
  const currentStepId = text(resume.current_step_id);
  const currentStep =
    steps.find((step) => text(step?.id) === currentStepId) ||
    steps.find(
      (step) => text(step?.capability_key) === CODE_COMMIT_CAPABILITY_KEY,
    ) ||
    null;

  if (text(currentStep?.capability_key) !== CODE_COMMIT_CAPABILITY_KEY) {
    return null;
  }

  const verifyAfter = object(currentStep?.verify_after);
  if (
    text(verifyAfter.capability_key) !== CODE_COMMIT_VERIFY_CAPABILITY_KEY
  ) {
    return null;
  }

  const stepPayload = object(currentStep?.payload);
  const executionKey = text(stepPayload.execution_key);
  if (!executionKey) return null;

  return {
    executionKey,
    commitMessage: text(stepPayload.commit_message) || null,
    verificationCapabilityKey: CODE_COMMIT_VERIFY_CAPABILITY_KEY,
  };
}

export function operatorExecutionStatePresentation(result = {}) {
  const execution = object(result?.execution);
  const agreementState = object(
    result?.agreement_state || result?.decision?.agreement_state,
  );
  const pendingExecution = object(agreementState?.pending_execution);
  const status = text(execution?.status).toLowerCase();
  const verificationStatus = text(
    execution?.post_action_verification?.status,
  ).toLowerCase();
  const capabilityKey = text(
    execution?.capability?.key ||
      execution?.capability?.capability_key ||
      execution?.capability_key ||
      pendingExecution?.capability_key,
  );
  const codeEvidence = object(
    execution?.code_execution_evidence ||
      execution?.post_action_verification?.code_execution_evidence ||
      result?.code_execution_evidence ||
      result?.provider_evidence?.code_execution_evidence ||
      result?.evidence?.code_execution_evidence,
  );
  const pendingCommit = pendingCodeCommitIntent(pendingExecution);

  if (text(pendingExecution?.capability_key)) {
    if (pendingCommit) {
      const proof = [
        `Code ${pendingCommit.executionKey}`,
        text(codeEvidence.repository_url) || null,
        text(codeEvidence.base_commit)
          ? `base ${text(codeEvidence.base_commit).slice(0, 12)}`
          : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return {
        tone: "pending",
        label: "Awaiting confirmation",
        detail: `${proof}. Engineering is verified locally; the governed commit to main is prepared only and has not executed.`,
        business_effect_verified: false,
      };
    }

    return {
      tone: "pending",
      label: "Awaiting approval",
      detail: `${text(pendingExecution.capability_key)} is prepared only. Nothing has executed yet.`,
      business_effect_verified: false,
    };
  }

  if (execution?.business_effect_verified === true) {
    const codeProof = [
      text(codeEvidence.execution_key)
        ? `Code ${text(codeEvidence.execution_key)}`
        : null,
      text(codeEvidence.repository_url) || null,
      text(codeEvidence.base_commit)
        ? `base ${text(codeEvidence.base_commit).slice(0, 12)}`
        : null,
      text(codeEvidence.commit_sha)
        ? `commit ${text(codeEvidence.commit_sha).slice(0, 12)}`
        : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      tone: "verified",
      label: "Verified complete",
      detail: codeProof
        ? `${codeProof} · independently verified`
        : capabilityKey
          ? `${capabilityKey} · business effect verified`
          : "The business effect was independently verified.",
      business_effect_verified: true,
    };
  }

  if (status === "blocked") {
    return {
      tone: "blocked",
      label: "Not completed",
      detail:
        "Execution is blocked or verification failed. No action is assumed complete.",
      business_effect_verified: false,
    };
  }

  if (status === "completed") {
    return {
      tone: "checked",
      label: "Completed check",
      detail:
        verificationStatus === "completed"
          ? "The verification read completed, but no business mutation is presented as verified without an explicit server-owned business-effect verdict."
          : "This turn completed without implying an unverified business mutation.",
      business_effect_verified: false,
    };
  }

  return null;
}

export const OperatorExecutionStatePresentation = Object.freeze({
  contract: "AVANTIQO_OPERATOR_EXECUTION_STATE_PRESENTATION_V1",
  authorization_effect: "NONE",
  present: operatorExecutionStatePresentation,
  pendingCodeCommitIntent,
});

export default OperatorExecutionStatePresentation;
