import {
  execute as executeUbteCapability,
} from "@/lib/ubte/runtime/ExecutionEngine";
import {
  listOperatorCapabilities,
} from "./OperatorCapabilityCatalog";
import {
  listOperatorNavigationTargets,
  resolveInstantOperatorNavigation,
  resolveOperatorCurrentScreen,
} from "./OperatorNavigationCatalog";
import {
  reasonAboutOperatorTurn,
} from "./OperatorReasoningRuntime";
import {
  verifyOperatorExecution,
} from "./OperatorVerificationRuntime";
import {
  isFastConversationTurn,
  runFastConversationTurn,
} from "./OperatorFastConversationRuntime";
import {
  recordOperatorExecutionAudit,
  resolveOperatorExecutionApproval,
} from "@/lib/operator/governance/operatorExecutionGovernance";
import {
  agreementWithAutonomousRun,
  autonomousRunFromAgreementState,
  createOperatorAutonomousRun,
  createOperatorMissionRun,
  operatorAutonomousRunRequiresPendingExecutionBinding,
  operatorPendingExecutionMatchesAutonomousRun,
  transitionOperatorAutonomousRun,
} from "@/lib/operator/contracts/OperatorAutonomousRun";

const OPERATOR_MISSION_KEY = "platform.operator_mission.execute";
const FULL_ACCESS_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);
const TERMINAL_AUTONOMOUS_RUN_STATUSES = new Set([
  "completed",
  "cancelled",
  "superseded",
]);
const TERMINAL_APPROVAL_FAILURE_REASONS = new Set([
  "APPROVAL_REJECTED",
  "APPROVAL_REQUEST_NOT_FOUND",
  "APPROVAL_REQUEST_MISMATCH",
  "APPROVAL_REQUEST_LOOKUP_FAILED",
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function normalizePermission(value) {
  return text(value).toLowerCase();
}

function normalizeRole(value) {
  return text(value).toUpperCase();
}

function normalizedUtterance(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0e00-\u0e7f\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isAffirmative(value) {
  const message = normalizedUtterance(value);
  return [
    "yes",
    "yeah",
    "yep",
    "ok",
    "okay",
    "sure",
    "confirm",
    "confirmed",
    "proceed",
    "do it",
    "go ahead",
    "ja",
    "oui",
    "si",
    "ตกลง",
    "ใช่",
    "ยืนยัน",
  ].includes(message);
}

function isNegative(value) {
  const message = normalizedUtterance(value);
  return [
    "no",
    "nope",
    "cancel",
    "stop",
    "dont",
    "do not",
    "nein",
    "nej",
    "non",
    "ไม่",
    "ยกเลิก",
  ].includes(message);
}

function isAutonomousRunStatusQuery(value) {
  const message = normalizedUtterance(value);
  return [
    "status",
    "what is the status",
    "whats the status",
    "what is happening",
    "whats happening",
    "what happened",
    "where are we",
    "where did we stop",
    "what are we waiting for",
    "what are you waiting for",
    "why are we blocked",
    "why is it blocked",
    "are we done",
    "is it done",
  ].includes(message);
}

function isAutonomousRunResumeRequest(value) {
  const message = normalizedUtterance(value);
  return [
    "continue",
    "resume",
    "continue run",
    "continue the run",
    "resume run",
    "resume the run",
    "carry on",
    "keep going",
    "go on",
    "continue where we left off",
    "resume where we left off",
    "continue from where we stopped",
    "resume from where we stopped",
  ].includes(message);
}

function hasContinuableProjectGoal(projectState = {}) {
  const objective = text(projectState?.objective);
  const status = text(projectState?.status).toLowerCase();

  return Boolean(objective) && !["idle", "completed", "cancelled"].includes(status);
}

function shouldContinueProjectInsteadOfTerminalRun({
  run,
  projectState,
  message,
}) {
  if (!run || !isAutonomousRunResumeRequest(message)) return false;
  if (!hasContinuableProjectGoal(projectState)) return false;

  return TERMINAL_AUTONOMOUS_RUN_STATUSES.has(
    text(run?.status).toLowerCase(),
  );
}

function runHasExactPendingBinding(run, agreementState = {}) {
  if (!operatorAutonomousRunRequiresPendingExecutionBinding(run)) return true;
  const pending = pendingAction(agreementState);
  return Boolean(
    pending && operatorPendingExecutionMatchesAutonomousRun(pending, run),
  );
}

function hasStoredPendingExecution(agreementState = {}) {
  return Object.prototype.hasOwnProperty.call(
    object(agreementState),
    "pending_execution",
  );
}

function autonomousRunStatusText(run) {
  const status = text(run?.status).toLowerCase();
  const blocker = text(run?.blocker);
  const steps = Array.isArray(run?.planned_steps) ? run.planned_steps : [];
  const currentStep = steps.find((step) => step.id === run?.current_step_id);
  const currentDescription = text(currentStep?.description);
  const hasEvidenceReads = steps.some(
    (step) => text(step?.kind).toLowerCase() === "read",
  );
  const mission = text(run?.run_kind).toLowerCase() === "mission";

  if (status === "awaiting_confirmation") {
    if (mission) {
      return currentDescription
        ? `The mission is paused at ${currentDescription}. That exact step requires your confirmation before I continue.`
        : "The mission is paused at a confirmation gate.";
    }
    return hasEvidenceReads
      ? "The evidence checks are complete. The requested action is ready and still waiting for your confirmation."
      : "The requested action is ready and still waiting for your confirmation.";
  }
  if (status === "awaiting_approval") {
    return mission
      ? "The mission is paused at its exact approval-gated step. I still have the remaining steps and will recheck the same approval request before continuing."
      : "The action is confirmed but paused for approval. I still have the exact pending action and approval request and will recheck that same approval before executing it.";
  }
  if (status === "executing") {
    return currentDescription
      ? `The run is executing: ${currentDescription}.`
      : "The confirmed action is executing.";
  }
  if (status === "verifying") {
    return mission
      ? currentDescription
        ? `The mission action ran and is paused on verification at: ${currentDescription}. I will retry only the verification, not the write.`
        : "The mission is paused on post-action verification. I will not replay the write."
      : currentDescription
        ? `The action completed and I am verifying the business result: ${currentDescription}.`
        : "The action completed and I am verifying the business result.";
  }
  if (status === "blocked") {
    return blocker
      ? `The run is blocked at the current step: ${blocker}.`
      : "The run is blocked at the current step and has not been marked complete.";
  }
  if (status === "completed") {
    return mission
      ? "This mission is complete. Every planned step finished, and every write step passed its registered verification read before the mission advanced."
      : "This run is complete. All planned steps that were required for completion finished successfully.";
  }
  if (status === "cancelled") {
    return "This run was cancelled and no pending action remains.";
  }
  if (status === "superseded") {
    return "This run was superseded by a newer request and will not resume automatically.";
  }
  return currentDescription
    ? `The run is active at: ${currentDescription}.`
    : "The run is active.";
}

function runStatusTurn({
  run,
  agreementState,
  projectState,
  locale,
  currentScreen = null,
}) {
  const orphaned = !runHasExactPendingBinding(run, agreementState);
  const stalePendingCleared = Boolean(
    orphaned && hasStoredPendingExecution(agreementState),
  );
  const nextAgreementState = stalePendingCleared
    ? clearedAgreementState(agreementState)
    : agreementState;
  return {
    success: true,
    decision: {
      response_text: orphaned
        ? "This autonomous run is preserved as history, but its exact pending execution is no longer safely bound to it. It is not resumable from shorthand or confirmation. Please restate the exact action if you still want it."
        : autonomousRunStatusText(run),
      response_language: locale || null,
      intent: orphaned ? "clarify" : "answer",
      confidence: 1,
      agreement_state: nextAgreementState,
      project_state: projectState,
      clarification: orphaned
        ? {
            required: true,
            question: "Please restate the exact action you want me to take.",
            options: [],
          }
        : { required: false, question: null, options: [] },
      navigation: { target_id: null },
      execution: { capability_key: null, payload: {}, reason: null },
      plan: [],
    },
    agreement_state: nextAgreementState,
    current_screen: currentScreen,
    provider_evidence: {
      provider: "avantiqo-local",
      model: "autonomous-run-status-v1",
      usage_id: null,
    },
    navigation: null,
    execution: null,
    operator_catalog: {
      navigation_target_count: 0,
      executable_capability_count: 0,
      bypassed_for_run_status: true,
      orphaned_pending_bound_run: orphaned,
      stale_pending_cleared: stalePendingCleared,
      execution_authorized: false,
    },
  };
}

function runResumeTurn({
  run,
  agreementState,
  projectState,
  locale,
}) {
  const orphaned = !runHasExactPendingBinding(run, agreementState);
  if (orphaned) {
    const stalePendingCleared = hasStoredPendingExecution(agreementState);
    const nextAgreementState = stalePendingCleared
      ? clearedAgreementState(agreementState)
      : agreementState;
    return {
      success: true,
      decision: {
        response_text:
          "I cannot resume that preserved run because its exact pending execution is no longer safely bound to it. I will not reconstruct or guess the old payload. Please restate the exact action you want now.",
        response_language: locale || null,
        intent: "clarify",
        confidence: 1,
        agreement_state: nextAgreementState,
        project_state: projectState,
        clarification: {
          required: true,
          question: "Please restate the exact action you want me to take.",
          options: [],
        },
        navigation: { target_id: null },
        execution: { capability_key: null, payload: {}, reason: null },
        plan: run?.planned_steps || [],
      },
      agreement_state: nextAgreementState,
      current_screen: null,
      provider_evidence: {
        provider: "avantiqo-local",
        model: "autonomous-run-resume-v1",
        usage_id: null,
      },
      navigation: null,
      execution: null,
      operator_catalog: {
        navigation_target_count: 0,
        executable_capability_count: 0,
        bypassed_for_run_resume: true,
        orphaned_pending_bound_run: true,
        stale_pending_cleared: stalePendingCleared,
        execution_authorized: false,
      },
    };
  }

  const status = text(run?.status).toLowerCase();
  const steps = Array.isArray(run?.planned_steps) ? run.planned_steps : [];
  const currentStep = steps.find((step) => step.id === run?.current_step_id);
  const currentDescription = text(currentStep?.description);
  const mission = text(run?.run_kind).toLowerCase() === "mission";
  let responseText;
  let clarification = { required: false, question: null, options: [] };
  let intent = "answer";

  if (status === "awaiting_confirmation") {
    responseText = currentDescription
      ? `I can continue from ${currentDescription}, but that action still requires your explicit confirmation. Say yes or proceed if you want me to execute it.`
      : "I can continue, but the pending action still requires your explicit confirmation. Say yes or proceed if you want me to execute it.";
    clarification = {
      required: true,
      question: "Should I proceed with that exact action?",
      options: [
        { id: "confirm", label: "Yes, proceed" },
        { id: "cancel", label: "No, cancel" },
      ],
    };
    intent = "plan";
  } else if (status === "completed") {
    responseText = "That run is already complete, so there is no unfinished step to resume.";
  } else if (status === "cancelled") {
    responseText = "That run was cancelled. I will not revive its old action automatically.";
  } else if (status === "superseded") {
    responseText = "That run was superseded by a newer request. I will not revive its old action automatically.";
  } else if (status === "blocked") {
    responseText = currentDescription
      ? `The run is blocked at ${currentDescription}, but there is no safe resumable operation stored for that stop gate.`
      : "The run is blocked, but there is no safe resumable operation stored for that stop gate.";
  } else if (status === "awaiting_approval") {
    responseText = mission
      ? "The mission is waiting for its exact stored approval request. Say continue after it is approved and I will resume from that exact step."
      : "The run is waiting for its exact stored approval request. I will recheck that request before executing the pending action.";
  } else if (status === "verifying" && mission) {
    responseText = "The mission write already ran, but its verification did not complete. Say continue and I will retry only the registered verification read, not the write.";
  } else {
    responseText = autonomousRunStatusText(run);
  }

  return {
    success: true,
    decision: {
      response_text: responseText,
      response_language: locale || null,
      intent,
      confidence: 1,
      agreement_state: agreementState,
      project_state: projectState,
      clarification,
      navigation: { target_id: null },
      execution: { capability_key: null, payload: {}, reason: null },
      plan: [],
    },
    agreement_state: agreementState,
    current_screen: null,
    provider_evidence: {
      provider: "avantiqo-local",
      model: "autonomous-run-resume-v1",
      usage_id: null,
    },
    navigation: null,
    execution: null,
    operator_catalog: {
      navigation_target_count: 0,
      executable_capability_count: 0,
      bypassed_for_run_resume: true,
    },
  };
}

function permissionMatches(granted, required) {
  const actual = normalizePermission(granted);
  const needed = normalizePermission(required);
  if (!actual || !needed) return false;
  if (actual === "*" || actual === needed) return true;
  if (actual.endsWith(".*")) {
    return needed.startsWith(actual.slice(0, -1));
  }
  return false;
}

function canUseCapability(capability, permissions = [], role = null) {
  if (FULL_ACCESS_ROLES.has(normalizeRole(role))) return true;

  const required = Array.isArray(capability?.permissions)
    ? capability.permissions.filter(Boolean)
    : [];

  if (!required.length) {
    return capability?.mode === "read";
  }

  return required.every((permission) =>
    permissions.some((granted) => permissionMatches(granted, permission)),
  );
}

function safeCapabilities(capabilities, permissions, role) {
  return capabilities.filter((capability) =>
    canUseCapability(capability, permissions, role),
  );
}

function executionBlockedReason(capability, { source = "text", confirmed = false } = {}) {
  if (!capability) return "CAPABILITY_NOT_AVAILABLE";

  const voice = text(source).toLowerCase() === "voice";
  if (voice && capability.mode !== "read" && !confirmed) {
    return "VOICE_CONFIRMATION_REQUIRED";
  }

  if (capability.requires_confirmation && !confirmed) {
    return "CONFIRMATION_REQUIRED";
  }

  if (!capability.auto_execute && !confirmed) {
    return "AUTOMATIC_EXECUTION_NOT_ENABLED";
  }

  return null;
}

function normalizedExecutionPayload({
  payload,
  organizationId,
  entityId,
  periodId,
  partyId,
}) {
  return {
    ...(payload && typeof payload === "object" ? payload : {}),
    organizationId,
    organization_id: organizationId,
    entityId,
    entity_id: entityId,
    periodId,
    period_id: periodId,
    partyId,
    party_id: partyId,
  };
}

function governanceBlockText(reason) {
  if (reason === "APPROVAL_WORKFLOW_NOT_CONFIGURED") {
    return "That action needs approval before I can run it, but no approval workflow is configured for it yet. Someone with governance access needs to set one up first.";
  }
  if (reason === "APPROVAL_REQUEST_FAILED") {
    return "I could not raise an approval request for that action, so I have not run it.";
  }
  if (reason === "APPROVAL_REJECTED") {
    return "The exact approval request for that action was rejected, so I have not run it.";
  }
  if (reason === "APPROVAL_REQUEST_NOT_FOUND") {
    return "I could not find the exact approval request linked to this pending action, so I will not run it or create a replacement automatically.";
  }
  if (reason === "APPROVAL_REQUEST_MISMATCH") {
    return "The stored approval request does not match this exact action scope, so I will not run the action.";
  }
  if (reason === "APPROVAL_REQUEST_LOOKUP_FAILED") {
    return "I could not safely verify the stored approval request, so the action remains blocked.";
  }
  return "That action requires approval before I can run it. I have raised an approval request and left it pending.";
}

function normalizedPendingVerificationRead(value) {
  const candidate = object(value);
  const capabilityKey = text(candidate.capability_key);
  if (!capabilityKey) return null;

  return {
    capability_key: capabilityKey,
    description:
      text(candidate.description) || "Verify the action took effect",
    payload: object(candidate.payload),
  };
}

function pendingAction(agreementState = {}) {
  const candidate = agreementState?.pending_execution;
  if (!candidate || typeof candidate !== "object") return null;

  const capabilityKey = text(candidate.capability_key);
  if (!capabilityKey) return null;

  return {
    capability_key: capabilityKey,
    payload:
      candidate.payload && typeof candidate.payload === "object"
        ? candidate.payload
        : {},
    reason: text(candidate.reason) || null,
    original_message: text(candidate.original_message).slice(0, 4000) || null,
    resume_kind: text(candidate.resume_kind).toLowerCase() || null,
    approval_request_id: text(candidate.approval_request_id) || null,
    verify_after: normalizedPendingVerificationRead(candidate.verify_after),
  };
}

function canonicalMissionValue(value) {
  if (Array.isArray(value)) return value.map(canonicalMissionValue);
  if (value === null || value === undefined) return value ?? null;
  if (typeof value !== "object") return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter(
        (key) =>
          value[key] !== undefined && typeof value[key] !== "function",
      )
      .map((key) => [key, canonicalMissionValue(value[key])]),
  );
}

function sameMissionValue(left, right) {
  return (
    JSON.stringify(canonicalMissionValue(left)) ===
    JSON.stringify(canonicalMissionValue(right))
  );
}

function missionVerificationProjection(value) {
  const candidate = object(value);
  const capabilityKey = text(candidate.capability_key);
  if (!capabilityKey) return null;

  return {
    capability_key: capabilityKey,
    description: text(candidate.description || candidate.label),
    payload: canonicalMissionValue(object(candidate.payload)),
  };
}

function missionStepProjection(value) {
  const candidate = object(value);
  return {
    id: text(candidate.id),
    description: text(candidate.description || candidate.label),
    capability_key: text(candidate.capability_key),
    payload: canonicalMissionValue(object(candidate.payload)),
    verify_after: missionVerificationProjection(candidate.verify_after),
  };
}

function missionResumeProjectionMatches(pending, run) {
  if (
    text(pending?.resume_kind).toLowerCase() !== "mission" ||
    text(pending?.capability_key) !== OPERATOR_MISSION_KEY ||
    text(run?.run_kind).toLowerCase() !== "mission"
  ) {
    return false;
  }

  const runStatus = text(run?.status).toLowerCase();
  if (
    !["awaiting_confirmation", "awaiting_approval", "verifying"].includes(
      runStatus,
    )
  ) {
    return false;
  }

  const payload = object(pending?.payload);
  const resume = object(payload.resume);
  const pendingSteps = Array.isArray(payload.steps)
    ? payload.steps.map(missionStepProjection)
    : [];
  const runSteps = Array.isArray(run?.planned_steps)
    ? run.planned_steps.map(missionStepProjection)
    : [];

  if (
    pendingSteps.length < 2 ||
    pendingSteps.length !== runSteps.length ||
    !sameMissionValue(pendingSteps, runSteps)
  ) {
    return false;
  }

  const currentStepId = text(resume.current_step_id);
  if (!currentStepId || currentStepId !== text(run?.current_step_id)) {
    return false;
  }

  const resumeCompleted = (Array.isArray(resume.completed_step_ids)
    ? resume.completed_step_ids
    : []
  )
    .map(text)
    .filter(Boolean);
  const runCompleted = (Array.isArray(run?.completed_steps)
    ? run.completed_steps
    : []
  )
    .map(text)
    .filter(Boolean);
  if (!sameMissionValue(resumeCompleted, runCompleted)) return false;

  const currentRunStep = Array.isArray(run?.planned_steps)
    ? run.planned_steps.find((step) => text(step?.id) === currentStepId)
    : null;
  if (!currentRunStep) return false;

  const approvalRequestId = text(resume.approval_request_id);
  if (approvalRequestId !== text(currentRunStep.approval_request_id)) {
    return false;
  }

  const confirmed = resume.current_step_confirmed === true;
  const verification = object(resume.verification_pending);
  const verificationStepId = text(verification.step_id);

  if (runStatus === "awaiting_confirmation") {
    return (
      !confirmed &&
      !approvalRequestId &&
      !verificationStepId &&
      text(currentRunStep.status).toLowerCase() === "awaiting_confirmation" &&
      text(currentRunStep.gate).toLowerCase() === "confirmation"
    );
  }

  if (runStatus === "awaiting_approval") {
    return (
      confirmed &&
      !verificationStepId &&
      text(currentRunStep.status).toLowerCase() === "awaiting_approval" &&
      text(currentRunStep.gate).toLowerCase() === "approval"
    );
  }

  const registeredVerification = missionVerificationProjection(
    currentRunStep.verify_after,
  );
  const pendingVerification = missionVerificationProjection(verification);
  return (
    confirmed &&
    !approvalRequestId &&
    verificationStepId === currentStepId &&
    text(currentRunStep.status).toLowerCase() === "verifying" &&
    Boolean(registeredVerification) &&
    sameMissionValue(pendingVerification, registeredVerification)
  );
}

function clearedAgreementState(agreementState = {}) {
  const next = {
    ...(agreementState && typeof agreementState === "object"
      ? agreementState
      : {}),
  };
  delete next.pending_execution;
  return next;
}

function pendingRunStateMismatchTurn({
  agreementState,
  projectState,
  locale,
  run,
}) {
  const blocker = "OPERATOR_PENDING_EXECUTION_RUN_STATE_MISMATCH";
  const nextAgreementState = clearedAgreementState(agreementState);

  return {
    success: true,
    decision: {
      response_text:
        "I will not act on that shorthand reply because the stored pending action no longer matches the exact autonomous run that created it. I cleared only the stale pending action and preserved the run unchanged.",
      response_language: locale || null,
      intent: "clarify",
      confidence: 1,
      agreement_state: nextAgreementState,
      project_state: projectState,
      clarification: {
        required: true,
        question: "Please restate the exact action you want me to take.",
        options: [],
      },
      navigation: { target_id: null },
      execution: {
        capability_key: null,
        payload: {},
        reason: blocker,
      },
      plan: run?.planned_steps || [],
    },
    agreement_state: nextAgreementState,
    current_screen: null,
    provider_evidence: null,
    navigation: null,
    execution: {
      status: "blocked",
      reason: blocker,
      capability_key: null,
      run_preserved: Boolean(run),
    },
    operator_catalog: {
      navigation_target_count: 0,
      executable_capability_count: 0,
      pending_run_binding_mismatch: true,
      stale_pending_cleared: true,
      autonomous_run_preserved: Boolean(run),
      execution_authorized: false,
    },
  };
}

function agreementWithRunTransition(agreementState, transition) {
  const run = autonomousRunFromAgreementState(agreementState);
  if (!run) return object(agreementState);
  return agreementWithAutonomousRun(
    agreementState,
    transitionOperatorAutonomousRun(run, transition),
  );
}

function agreementWithApprovalRequest(agreementState, approvalRequest) {
  const approvalRequestId = text(approvalRequest?.id);
  const pending = object(agreementState?.pending_execution);
  if (!approvalRequestId || !text(pending.capability_key)) {
    return object(agreementState);
  }

  return {
    ...object(agreementState),
    pending_execution: {
      ...pending,
      approval_request_id: approvalRequestId,
    },
  };
}

function approvalRunTransition(agreementState, governance) {
  const terminalFailure = TERMINAL_APPROVAL_FAILURE_REASONS.has(
    text(governance?.reason),
  );
  return agreementWithRunTransition(agreementState, {
    status: terminalFailure ? "blocked" : "awaiting_approval",
    currentStepId: "requested_action",
    stepId: "requested_action",
    stepStatus: terminalFailure ? "failed" : "awaiting_approval",
    blocker: governance?.reason || "APPROVAL_REQUIRED",
    approvalRequestId: text(governance?.approvalRequest?.id) || null,
  });
}

function isMissionExecutionResult(capability, result) {
  return (
    text(capability?.key) === OPERATOR_MISSION_KEY &&
    text(result?.mission_mode) === "durable_registered_sequence"
  );
}

function missionPauseText(result, currentStep) {
  const completed = Number(result?.completed_steps || 0);
  const total = Number(result?.total_steps || 0);
  const step = text(currentStep?.description || currentStep?.label);
  const prefix = `${completed} of ${total} mission steps are complete.`;

  if (result?.pause_reason === "confirmation") {
    return step
      ? `${prefix} The next exact step is ${step}, and it requires your confirmation. Should I proceed?`
      : `${prefix} The next step requires your confirmation. Should I proceed?`;
  }
  if (result?.pause_reason === "approval") {
    return step
      ? `${prefix} I paused at ${step} because its exact approval request must be approved before I continue.`
      : `${prefix} I paused at an approval gate and preserved the exact remaining mission.`;
  }
  if (result?.pause_reason === "verification") {
    return step
      ? `${prefix} The action at ${step} already ran, but its registered verification did not complete. I preserved the exact mission state and will retry only the verification on continue.`
      : `${prefix} A write already ran, but verification did not complete. I will not replay the write.`;
  }
  return `${prefix} The mission is paused and its exact remaining state is preserved.`;
}

function missionResultAgreementState({
  agreementState,
  result,
  originalMessage,
  objective,
}) {
  const existingRun = autonomousRunFromAgreementState(agreementState);
  const continuingMission =
    text(agreementState?.pending_execution?.resume_kind) === "mission" &&
    text(existingRun?.run_kind) === "mission";
  const hasMissionState =
    result?.mission_state && typeof result.mission_state === "object";

  if (!hasMissionState) {
    let next = clearedAgreementState(agreementState);
    if (continuingMission && existingRun) {
      const currentStepId = text(existingRun?.current_step_id) || null;
      next = agreementWithRunTransition(next, {
        status: "blocked",
        currentStepId,
        stepId: currentStepId,
        stepStatus: "failed",
        blocker:
          text(result?.reason) || "OPERATOR_MISSION_BLOCKED_BEFORE_STATE",
      });
    }
    return next;
  }

  const state = object(result.mission_state);
  const run = createOperatorMissionRun({
    objective:
      text(objective) || text(originalMessage) || "Complete the requested mission",
    missionState: continuingMission
      ? {
          ...state,
          run_id: existingRun.run_id,
          created_at: existingRun.created_at,
        }
      : state,
  });
  let next = agreementWithAutonomousRun(clearedAgreementState(agreementState), run);

  if (text(result?.status) === "paused" && result?.resume_payload) {
    next = {
      ...next,
      pending_execution: {
        capability_key: OPERATOR_MISSION_KEY,
        payload: object(result.resume_payload),
        reason:
          text(result?.reason) ||
          `Resume mission from ${text(result?.current_step_id) || "the stored step"}`,
        original_message: text(originalMessage).slice(0, 4000) || null,
        resume_kind: "mission",
      },
    };
  }

  return next;
}

function missionResultTurn({
  result,
  capability,
  agreementState,
  projectState,
  locale,
  currentScreen,
  navigationTargetCount,
  executableCapabilityCount,
  originalMessage,
  objective,
  resumedRun = false,
}) {
  const nextAgreementState = missionResultAgreementState({
    agreementState,
    result,
    originalMessage,
    objective,
  });
  const run = autonomousRunFromAgreementState(nextAgreementState);
  const currentStep = run?.planned_steps?.find(
    (step) => step.id === run?.current_step_id,
  );
  const paused = text(result?.status) === "paused";
  const blocked = text(result?.status) === "blocked";
  const confirmation = paused && result?.pause_reason === "confirmation";
  const responseText = paused
    ? missionPauseText(result, currentStep)
    : blocked
      ? `The mission is blocked at ${text(currentStep?.description) || "the current step"}: ${text(result?.reason) || "the step could not complete safely"}. I did not replan or skip it.`
      : `Mission complete. ${Number(result?.completed_steps || 0)} of ${Number(result?.total_steps || 0)} steps finished, and every write step passed its registered verification before I advanced.`;

  return {
    success: true,
    decision: {
      response_text: responseText,
      response_language: locale || null,
      intent: confirmation ? "plan" : "answer",
      confidence: 1,
      agreement_state: nextAgreementState,
      project_state: projectState,
      clarification: confirmation
        ? {
            required: true,
            question: "Should I proceed with that exact mission step?",
            options: [
              { id: "confirm", label: "Yes, proceed" },
              { id: "cancel", label: "No, cancel" },
            ],
          }
        : { required: false, question: null, options: [] },
      navigation: { target_id: null },
      execution: {
        capability_key: OPERATOR_MISSION_KEY,
        payload: paused ? object(result?.resume_payload) : {},
        reason: text(result?.reason) || null,
      },
      plan: run?.planned_steps || [],
    },
    agreement_state: nextAgreementState,
    current_screen: currentScreen,
    provider_evidence: null,
    navigation: null,
    execution: {
      status: paused ? "paused" : blocked ? "blocked" : "completed",
      resumed_run: resumedRun,
      capability: {
        key: capability.key,
        domain: capability.domain,
        capability: capability.capability,
        action: capability.action,
        mode: capability.mode,
      },
      result,
    },
    operator_catalog: {
      navigation_target_count: navigationTargetCount,
      executable_capability_count: executableCapabilityCount,
    },
  };
}

function clearPendingAndSupersedeRun(agreementState, shouldSupersede) {
  const cleared = clearedAgreementState(agreementState);
  if (!shouldSupersede) return cleared;
  return agreementWithRunTransition(cleared, {
    status: "superseded",
    stepId: "requested_action",
    stepStatus: "superseded",
    blocker: "Pending action superseded by a new user request",
  });
}

function agreementWithPendingConfirmationRun({
  agreementState,
  capability,
  payload,
  reason,
  originalMessage,
  objective,
  approvalRequestId = null,
}) {
  const pendingExecution = {
    capability_key: capability.key,
    payload: object(payload),
    reason: text(reason) || null,
    original_message: text(originalMessage).slice(0, 4000) || null,
    ...(text(approvalRequestId)
      ? { approval_request_id: text(approvalRequestId) }
      : {}),
  };
  const withPending = {
    ...object(agreementState),
    pending_execution: pendingExecution,
  };

  return agreementWithAutonomousRun(
    withPending,
    createOperatorAutonomousRun({
      objective:
        text(objective) ||
        text(originalMessage) ||
        "Complete the requested business action",
      pendingExecution: {
        capability_key: capability.key,
        description:
          text(reason) ||
          text(capability.description) ||
          "Run the requested business action",
        payload: object(payload),
      },
    }),
  );
}

function pendingVerificationExecution(verificationRead, originalMessage = null) {
  const candidate = normalizedPendingVerificationRead(verificationRead);
  if (!candidate) return null;

  return {
    capability_key: candidate.capability_key,
    payload: candidate.payload,
    reason: `Retry post-action verification: ${candidate.description}`,
    original_message: text(originalMessage).slice(0, 4000) || null,
    resume_kind: "verification",
  };
}

function completedAgreementState(agreementState, pending, postActionVerification) {
  let next = clearedAgreementState(agreementState);
  next = agreementWithRunTransition(next, {
    status: pending?.verify_after ? "verifying" : "completed",
    currentStepId: pending?.verify_after ? "post_action_verification" : null,
    stepId: "requested_action",
    stepStatus: "completed",
    blocker: null,
  });

  if (!pending?.verify_after) return next;

  if (text(postActionVerification?.status).toLowerCase() === "completed") {
    return agreementWithRunTransition(next, {
      status: "completed",
      currentStepId: null,
      stepId: "post_action_verification",
      stepStatus: "completed",
      blocker: null,
    });
  }

  const verificationPending = pendingVerificationExecution(
    pending.verify_after,
    pending.original_message,
  );
  if (verificationPending) {
    next = {
      ...next,
      pending_execution: verificationPending,
    };
  }

  return agreementWithRunTransition(next, {
    status: "blocked",
    currentStepId: "post_action_verification",
    stepId: "post_action_verification",
    stepStatus: "failed",
    blocker:
      text(
        postActionVerification?.reason ||
          postActionVerification?.error,
      ) || "Post-action verification did not complete",
  });
}

async function executeCapability({
  capability,
  payload,
  organizationId,
  entityId,
  periodId,
  partyId,
  actor,
  permissions,
  source,
  callerRequest,
  approvalRequestId = null,
  runtimeMetadata = {},
}) {
  const normalizedPayload = normalizedExecutionPayload({
    payload,
    organizationId,
    entityId,
    periodId,
    partyId,
  });

  const actorId = text(actor?.id || actor?.user_id) || null;
  const actorName = text(actor?.name || actor?.email) || null;

  const approval = await resolveOperatorExecutionApproval({
    capability,
    organizationId,
    entityId,
    actorId,
    approvalRequestId,
  });

  if (!approval.allowed) {
    await recordOperatorExecutionAudit({
      capability,
      organizationId,
      entityId,
      actorId,
      actorName,
      payload: normalizedPayload,
      source,
      outcome: "blocked",
      approval,
    });

    const blocked = new Error(approval.reason);
    blocked.operatorGovernance = approval;
    throw blocked;
  }

  try {
    const result = await executeUbteCapability({
      organizationId,
      domain: capability.domain,
      capability: capability.capability,
      action: capability.action,
      payload: normalizedPayload,
      actor,
      runtime: {
        entityId,
        periodId,
        permissions,
        callerRequest,
        metadata: {
          source: "AVANTIQO_OPERATOR",
          channel: text(source) || "text",
          partyId,
          operatorCapabilityKey: capability.key,
          conversationallyConfirmed: true,
          ...object(runtimeMetadata),
        },
      },
    });

    await recordOperatorExecutionAudit({
      capability,
      organizationId,
      entityId,
      actorId,
      actorName,
      payload: normalizedPayload,
      source,
      outcome: "executed",
      result,
      approval,
    });

    return result;
  } catch (executionError) {
    await recordOperatorExecutionAudit({
      capability,
      organizationId,
      entityId,
      actorId,
      actorName,
      payload: normalizedPayload,
      source,
      outcome: "failed",
      error: executionError?.message || String(executionError),
      approval,
    });

    throw executionError;
  }
}

async function runPendingPostActionVerification({
  pending,
  capabilities,
  organizationId,
  entityId,
  periodId,
  partyId,
  actor,
  permissions,
  source,
  callerRequest,
}) {
  if (!pending?.verify_after) return null;

  const verificationCapability = capabilities.find(
    (item) =>
      item.key === pending.verify_after.capability_key &&
      item.mode === "read",
  );

  if (!verificationCapability) {
    return {
      status: "unavailable",
      capability_key: pending.verify_after.capability_key,
      description: pending.verify_after.description,
      reason: "POST_ACTION_VERIFICATION_CAPABILITY_NOT_AVAILABLE",
    };
  }

  try {
    const result = await executeCapability({
      capability: verificationCapability,
      payload: pending.verify_after.payload,
      organizationId,
      entityId,
      periodId,
      partyId,
      actor,
      permissions,
      source,
      callerRequest,
    });

    return {
      status: "completed",
      capability_key: verificationCapability.key,
      description: pending.verify_after.description,
      result,
    };
  } catch (verificationError) {
    return {
      status: "failed",
      capability_key: verificationCapability.key,
      description: pending.verify_after.description,
      error: text(verificationError?.message) || "Post-action verification failed",
    };
  }
}

async function retryPendingVerification({
  pending,
  capabilities,
  organizationId,
  entityId,
  periodId,
  partyId,
  actor,
  permissions,
  source,
  callerRequest,
}) {
  return runPendingPostActionVerification({
    pending: {
      verify_after: {
        capability_key: pending.capability_key,
        description: pending.reason || "Verify the business effect",
        payload: pending.payload,
      },
    },
    capabilities,
    organizationId,
    entityId,
    periodId,
    partyId,
    actor,
    permissions,
    source,
    callerRequest,
  });
}

export async function runOperatorTurn({
  organizationId,
  entityId = null,
  periodId = null,
  partyId,
  actor,
  role = null,
  permissions = [],
  locale = null,
  timezone = null,
  message,
  source = "text",
  pathname = null,
  agreementState = {},
  projectState = {},
  conversation = [],
  callerRequest = null,
} = {}) {
  if (!organizationId) throw new Error("OPERATOR_ORGANIZATION_REQUIRED");
  if (!partyId) throw new Error("OPERATOR_PARTY_REQUIRED");
  if (!text(message)) throw new Error("OPERATOR_MESSAGE_REQUIRED");

  const offeredPending = pendingAction(agreementState);
  const activeRun = autonomousRunFromAgreementState(agreementState);

  if (activeRun && isAutonomousRunStatusQuery(message)) {
    return runStatusTurn({
      run: activeRun,
      agreementState,
      projectState,
      locale,
    });
  }

  const continueProjectAfterTerminalRun =
    shouldContinueProjectInsteadOfTerminalRun({
      run: activeRun,
      projectState,
      message,
    });
  const resumeRequested = Boolean(
    activeRun &&
      isAutonomousRunResumeRequest(message) &&
      !continueProjectAfterTerminalRun,
  );
  const resumeFromApproval = Boolean(
    resumeRequested &&
      text(activeRun?.status).toLowerCase() === "awaiting_approval" &&
      offeredPending &&
      offeredPending.resume_kind !== "verification",
  );
  const resumeMission = Boolean(
    resumeRequested &&
      offeredPending?.resume_kind === "mission" &&
      ["awaiting_approval", "verifying"].includes(
        text(activeRun?.status).toLowerCase(),
      ),
  );
  const resumeVerification = Boolean(
    resumeRequested &&
      text(activeRun?.status).toLowerCase() === "blocked" &&
      text(activeRun?.current_step_id) === "post_action_verification" &&
      offeredPending?.resume_kind === "verification",
  );
  const invalidMissionRunShapeResumeRequest = Boolean(
    offeredPending?.resume_kind === "mission" &&
      isAutonomousRunResumeRequest(message) &&
      (!activeRun || text(activeRun?.run_kind).toLowerCase() !== "mission"),
  );

  if (
    resumeRequested &&
    !resumeFromApproval &&
    !resumeMission &&
    !resumeVerification
  ) {
    return runResumeTurn({
      run: activeRun,
      agreementState,
      projectState,
      locale,
    });
  }

  const retryVerificationRequested = Boolean(
    offeredPending?.resume_kind === "verification" &&
      (isAffirmative(message) || resumeVerification),
  );
  const respondsToPending = Boolean(
    offeredPending &&
      (
        isAffirmative(message) ||
        isNegative(message) ||
        resumeFromApproval ||
        resumeMission ||
        resumeVerification ||
        invalidMissionRunShapeResumeRequest
      ),
  );

  const genericPendingBindingMismatch = Boolean(
    respondsToPending &&
      offeredPending?.resume_kind !== "mission" &&
      !operatorPendingExecutionMatchesAutonomousRun(offeredPending, activeRun),
  );
  if (genericPendingBindingMismatch) {
    return pendingRunStateMismatchTurn({
      agreementState,
      projectState,
      locale,
      run: activeRun,
    });
  }

  const pending = respondsToPending ? offeredPending : null;
  const activeAgreementState = respondsToPending
    ? agreementState
    : clearPendingAndSupersedeRun(agreementState, Boolean(offeredPending));

  if (!pending && isFastConversationTurn({
    message,
    source,
    locale,
    timezone,
  })) {
    return runFastConversationTurn({
      organizationId,
      partyId,
      entityId,
      locale,
      timezone,
      message,
      conversation,
      agreementState: activeAgreementState,
      projectState,
    });
  }

  const navigationTargets = listOperatorNavigationTargets({ organizationId });
  const currentScreen = resolveOperatorCurrentScreen({
    organizationId,
    pathname,
  });

  if (!pending) {
    const instantNavigation = resolveInstantOperatorNavigation({
      message,
      targets: navigationTargets,
    });

    if (instantNavigation?.matched && instantNavigation.target) {
      const target = instantNavigation.target;
      return {
        success: true,
        decision: {
          response_text: `Opening ${target.name}.`,
          response_language: locale || null,
          intent: "navigate",
          confidence: 1,
          agreement_state: activeAgreementState,
          project_state: projectState,
          clarification: { required: false, question: null, options: [] },
          navigation: { target_id: target.id },
          execution: { capability_key: null, payload: {}, reason: null },
          plan: [],
        },
        agreement_state: activeAgreementState,
        current_screen: currentScreen,
        provider_evidence: {
          provider: "avantiqo-local",
          model: "instant-navigation-v1",
          usage_id: null,
        },
        navigation: {
          target_id: target.id,
          name: target.name,
          href: target.href,
          route: target.route,
        },
        execution: null,
        operator_catalog: {
          navigation_target_count: navigationTargets.length,
          executable_capability_count: 0,
          bypassed_for_instant_navigation: true,
        },
      };
    }

    if (instantNavigation?.ambiguous) {
      const options = instantNavigation.alternatives.map((target) => ({
        id: target.id,
        label: [target.name, target.group_name || target.domain_id]
          .filter(Boolean)
          .join(" — "),
      }));
      return {
        success: true,
        decision: {
          response_text: `I found more than one matching workspace. Which one do you mean: ${options.map((option) => option.label).join(", ")}?`,
          response_language: locale || null,
          intent: "clarify",
          confidence: 1,
          agreement_state: activeAgreementState,
          project_state: projectState,
          clarification: {
            required: true,
            question: "Which workspace should I open?",
            options,
          },
          navigation: { target_id: null },
          execution: { capability_key: null, payload: {}, reason: null },
          plan: [],
        },
        agreement_state: activeAgreementState,
        current_screen: currentScreen,
        provider_evidence: {
          provider: "avantiqo-local",
          model: "instant-navigation-v1",
          usage_id: null,
        },
        navigation: null,
        execution: null,
        operator_catalog: {
          navigation_target_count: navigationTargets.length,
          executable_capability_count: 0,
          bypassed_for_instant_navigation: true,
        },
      };
    }
  }

  const discoveredCapabilities = await listOperatorCapabilities();
  const capabilities = safeCapabilities(
    discoveredCapabilities,
    Array.isArray(permissions) ? permissions : [],
    role,
  );

  if (pending && isNegative(message)) {
    const cancellingVerification = pending.resume_kind === "verification";
    const cancellingMission = pending.resume_kind === "mission";
    const cancelledStepId = cancellingMission
      ? text(activeRun?.current_step_id)
      : cancellingVerification
        ? "post_action_verification"
        : "requested_action";
    const nextAgreementState = agreementWithRunTransition(
      clearedAgreementState(agreementState),
      {
        status: "cancelled",
        stepId: cancelledStepId,
        stepStatus: "cancelled",
        blocker: cancellingMission
          ? "User cancelled the remaining mission"
          : cancellingVerification
            ? "User cancelled the pending verification retry"
            : "User cancelled the pending action",
      },
    );

    return {
      success: true,
      decision: {
        response_text: cancellingMission
          ? "Okay. I cancelled the remaining mission steps. I will not revive them automatically."
          : cancellingVerification
            ? "Okay. I will not retry the verification. The business action already ran, but its final effect remains unverified."
            : "Okay. I cancelled that action.",
        response_language: locale || null,
        intent: "answer",
        confidence: 1,
        agreement_state: nextAgreementState,
        clarification: {
          required: false,
          question: null,
          options: [],
        },
        navigation: { target_id: null },
        execution: {
          capability_key: null,
          payload: {},
          reason: null,
        },
        plan: [],
      },
      agreement_state: nextAgreementState,
      current_screen: currentScreen,
      provider_evidence: null,
      navigation: null,
      execution: {
        status: "cancelled",
        capability_key: pending.capability_key,
        resume_kind: pending.resume_kind,
      },
      operator_catalog: {
        navigation_target_count: navigationTargets.length,
        executable_capability_count: capabilities.length,
      },
    };
  }

  if (
    pending?.resume_kind === "mission" &&
    !missionResumeProjectionMatches(pending, activeRun)
  ) {
    const blocker = "OPERATOR_MISSION_RESUME_RUN_STATE_MISMATCH";
    const currentStepId = text(activeRun?.current_step_id) || null;
    let nextAgreementState = clearedAgreementState(agreementState);
    if (activeRun) {
      nextAgreementState = agreementWithRunTransition(nextAgreementState, {
        status: "blocked",
        currentStepId,
        stepId: currentStepId,
        stepStatus: "failed",
        blocker,
      });
    }

    return {
      success: true,
      decision: {
        response_text:
          "I will not resume this mission because its stored pending execution no longer matches its stored mission run. I cleared the resumable action rather than risk executing a different step.",
        response_language: locale || null,
        intent: "answer",
        confidence: 1,
        agreement_state: nextAgreementState,
        project_state: projectState,
        clarification: {
          required: false,
          question: null,
          options: [],
        },
        navigation: { target_id: null },
        execution: {
          capability_key: null,
          payload: {},
          reason: blocker,
        },
        plan: activeRun?.planned_steps || [],
      },
      agreement_state: nextAgreementState,
      current_screen: currentScreen,
      provider_evidence: null,
      navigation: null,
      execution: {
        status: "blocked",
        reason: blocker,
        capability_key: OPERATOR_MISSION_KEY,
        resumed_run: false,
      },
      operator_catalog: {
        navigation_target_count: navigationTargets.length,
        executable_capability_count: capabilities.length,
      },
    };
  }

  if (retryVerificationRequested && pending) {
    const verificationCapability = capabilities.find(
      (item) => item.key === pending.capability_key && item.mode === "read",
    );
    const retryResult = await retryPendingVerification({
      pending,
      capabilities,
      organizationId,
      entityId,
      periodId,
      partyId,
      actor,
      permissions,
      source,
      callerRequest,
    });
    const retryCompleted =
      text(retryResult?.status).toLowerCase() === "completed";
    const nextAgreementState = agreementWithRunTransition(
      retryCompleted ? clearedAgreementState(agreementState) : agreementState,
      {
        status: retryCompleted ? "completed" : "blocked",
        currentStepId: retryCompleted ? null : "post_action_verification",
        stepId: "post_action_verification",
        stepStatus: retryCompleted ? "completed" : "failed",
        blocker: retryCompleted
          ? null
          : text(retryResult?.reason || retryResult?.error) ||
            "Post-action verification did not complete",
      },
    );

    let responseText = retryCompleted
      ? "The verification completed successfully and the run is now complete."
      : `The verification still could not complete: ${text(
          retryResult?.reason || retryResult?.error,
        ) || "the verification read failed"}.`;
    let verificationEvidence = null;
    let nextProjectState = projectState;

    if (retryCompleted && verificationCapability) {
      try {
        const verification = await verifyOperatorExecution({
          organizationId,
          partyId,
          entityId,
          locale,
          timezone,
          originalMessage:
            pending.original_message || text(activeRun?.objective) || message,
          source,
          currentScreen,
          agreementState: nextAgreementState,
          projectState,
          conversation,
          capability: verificationCapability,
          result: retryResult.result,
        });
        responseText = verification?.decision?.response_text || responseText;
        verificationEvidence = verification?.provider_evidence || null;
        nextProjectState = verification?.decision?.project_state || nextProjectState;
      } catch (verificationError) {
        console.error("OPERATOR_VERIFICATION_ERROR", verificationError);
      }
    }

    return {
      success: true,
      decision: {
        response_text: responseText,
        response_language: locale || null,
        intent: "answer",
        confidence: 1,
        agreement_state: nextAgreementState,
        project_state: nextProjectState,
        clarification: {
          required: false,
          question: null,
          options: [],
        },
        navigation: { target_id: null },
        execution: {
          capability_key: verificationCapability?.key || pending.capability_key,
          payload: pending.payload,
          reason: pending.reason,
        },
        plan: [],
      },
      agreement_state: nextAgreementState,
      current_screen: currentScreen,
      provider_evidence: {
        verification: verificationEvidence,
      },
      navigation: null,
      execution: {
        status: retryCompleted ? "completed" : "blocked",
        resumed_run: true,
        resume_kind: "verification",
        capability: verificationCapability
          ? {
              key: verificationCapability.key,
              domain: verificationCapability.domain,
              capability: verificationCapability.capability,
              action: verificationCapability.action,
              mode: verificationCapability.mode,
            }
          : null,
        result: retryResult,
      },
      operator_catalog: {
        navigation_target_count: navigationTargets.length,
        executable_capability_count: capabilities.length,
      },
    };
  }

  if (pending && (isAffirmative(message) || resumeFromApproval || resumeMission)) {
    const capability = capabilities.find(
      (item) => item.key === pending.capability_key,
    );

    if (!capability) {
      const nextAgreementState = agreementWithRunTransition(
        clearedAgreementState(agreementState),
        {
          status: "blocked",
          stepId: text(activeRun?.current_step_id) || "requested_action",
          stepStatus: "failed",
          blocker: "CAPABILITY_NOT_AVAILABLE",
        },
      );

      return {
        success: true,
        decision: {
          response_text:
            "I can no longer execute that pending action because the capability is not available in your current access context.",
          response_language: locale || null,
          intent: "clarify",
          confidence: 1,
          agreement_state: nextAgreementState,
          clarification: {
            required: true,
            question: "Would you like me to help you choose another action?",
            options: [],
          },
          navigation: { target_id: null },
          execution: {
            capability_key: null,
            payload: {},
            reason: null,
          },
          plan: [],
        },
        agreement_state: nextAgreementState,
        current_screen: currentScreen,
        provider_evidence: null,
        navigation: null,
        execution: {
          status: "blocked",
          reason: "CAPABILITY_NOT_AVAILABLE",
        },
        operator_catalog: {
          navigation_target_count: navigationTargets.length,
          executable_capability_count: capabilities.length,
        },
      };
    }

    let result;
    const missionResume = pending.resume_kind === "mission";

    try {
      result = await executeCapability({
        capability,
        payload: pending.payload,
        organizationId,
        entityId,
        periodId,
        partyId,
        actor,
        permissions,
        source,
        callerRequest,
        approvalRequestId: pending.approval_request_id,
        runtimeMetadata: missionResume
          ? {
              operatorMissionResume: true,
              operatorMissionConfirmed: isAffirmative(message),
            }
          : {},
      });
    } catch (executionError) {
      if (!executionError?.operatorGovernance) throw executionError;

      const governance = executionError.operatorGovernance;
      const approvalBoundState = agreementWithApprovalRequest(
        agreementState,
        governance.approvalRequest,
      );
      const governanceState = approvalRunTransition(
        approvalBoundState,
        governance,
      );

      return {
        success: true,
        decision: {
          response_text: governanceBlockText(governance.reason),
          response_language: locale || null,
          intent: "answer",
          confidence: 1,
          agreement_state: governanceState,
          clarification: {
            required: false,
            question: null,
            options: [],
          },
          navigation: { target_id: null },
          execution: {
            capability_key: capability.key,
            payload: pending.payload,
            reason: pending.reason,
          },
          plan: [],
        },
        agreement_state: governanceState,
        current_screen: currentScreen,
        provider_evidence: null,
        navigation: null,
        execution: {
          status: "blocked",
          reason: governance.reason,
          capability_key: capability.key,
          approval_request: governance.approvalRequest || null,
          resumed_run: resumeFromApproval,
        },
        operator_catalog: {
          navigation_target_count: navigationTargets.length,
          executable_capability_count: capabilities.length,
        },
      };
    }

    if (isMissionExecutionResult(capability, result)) {
      return missionResultTurn({
        result,
        capability,
        agreementState,
        projectState,
        locale,
        currentScreen,
        navigationTargetCount: navigationTargets.length,
        executableCapabilityCount: capabilities.length,
        originalMessage: pending.original_message || message,
        objective: text(activeRun?.objective) || pending.original_message || message,
        resumedRun: true,
      });
    }

    const postActionVerification = await runPendingPostActionVerification({
      pending,
      capabilities,
      organizationId,
      entityId,
      periodId,
      partyId,
      actor,
      permissions,
      source,
      callerRequest,
    });
    const verificationResult = postActionVerification
      ? {
          action_result: result,
          post_action_verification: postActionVerification,
        }
      : result;
    const nextAgreementState = completedAgreementState(
      agreementState,
      pending,
      postActionVerification,
    );

    let responseText = "Done. The confirmed action completed successfully.";
    let verificationEvidence = null;
    let nextProjectState = projectState;

    try {
      const verification = await verifyOperatorExecution({
        organizationId,
        partyId,
        entityId,
        locale,
        timezone,
        originalMessage: pending.original_message || message,
        source,
        currentScreen,
        agreementState: nextAgreementState,
        projectState,
        conversation,
        capability,
        result: verificationResult,
      });

      responseText = verification?.decision?.response_text || responseText;
      verificationEvidence = verification?.provider_evidence || null;
      nextProjectState = verification?.decision?.project_state || nextProjectState;
    } catch (verificationError) {
      console.error("OPERATOR_VERIFICATION_ERROR", verificationError);
    }

    return {
      success: true,
      decision: {
        response_text: responseText,
        response_language: locale || null,
        intent: "answer",
        confidence: 1,
        agreement_state: nextAgreementState,
        project_state: nextProjectState,
        clarification: {
          required: false,
          question: null,
          options: [],
        },
        navigation: { target_id: null },
        execution: {
          capability_key: capability.key,
          payload: pending.payload,
          reason: pending.reason,
        },
        plan: [],
      },
      agreement_state: nextAgreementState,
      current_screen: currentScreen,
      provider_evidence: {
        verification: verificationEvidence,
      },
      navigation: null,
      execution: {
        status: "completed",
        capability: {
          key: capability.key,
          domain: capability.domain,
          capability: capability.capability,
          action: capability.action,
          mode: capability.mode,
        },
        result,
        ...(postActionVerification
          ? { post_action_verification: postActionVerification }
          : {}),
        resumed_run: resumeFromApproval,
      },
      operator_catalog: {
        navigation_target_count: navigationTargets.length,
        executable_capability_count: capabilities.length,
      },
    };
  }

  const reasoning = await reasonAboutOperatorTurn({
    organizationId,
    partyId,
    entityId,
    locale,
    timezone,
    message,
    source,
    currentScreen,
    agreementState: activeAgreementState,
    projectState,
    conversation,
    navigationTargets,
    capabilities,
  });

  const decision = reasoning.decision;
  const response = {
    success: true,
    decision,
    agreement_state: decision.agreement_state,
    current_screen: currentScreen,
    provider_evidence: reasoning.provider_evidence,
    navigation: null,
    execution: null,
    operator_catalog: {
      navigation_target_count: navigationTargets.length,
      executable_capability_count: capabilities.length,
    },
  };

  if (decision.intent === "navigate" && decision.navigation.target_id) {
    const target = navigationTargets.find(
      (item) => item.id === decision.navigation.target_id,
    );

    if (!target) {
      return {
        ...response,
        decision: {
          ...decision,
          intent: "clarify",
          response_text:
            "I understood that you want me to open something, but I could not match it to a registered Avantiqo workspace yet.",
          clarification: {
            required: true,
            question: "Which workspace do you want me to open?",
            options: [],
          },
        },
      };
    }

    response.navigation = {
      target_id: target.id,
      name: target.name,
      href: target.href,
      route: target.route,
    };

    return response;
  }

  if (decision.intent !== "execute" || !decision.execution.capability_key) {
    return response;
  }

  const capability = capabilities.find(
    (item) => item.key === decision.execution.capability_key,
  );
  const blocked = executionBlockedReason(capability, {
    source,
    confirmed: false,
  });

  if (blocked) {
    const needsConfirmation =
      blocked === "VOICE_CONFIRMATION_REQUIRED" ||
      blocked === "CONFIRMATION_REQUIRED";

    const nextAgreementState = needsConfirmation && capability
      ? agreementWithPendingConfirmationRun({
          agreementState: decision.agreement_state,
          capability,
          payload: decision.execution.payload,
          reason: decision.execution.reason,
          originalMessage: message,
          objective:
            text(decision.project_state?.objective) ||
            text(projectState?.objective) ||
            text(message),
        })
      : decision.agreement_state;

    return {
      ...response,
      agreement_state: nextAgreementState,
      execution: {
        status: "blocked",
        reason: blocked,
        capability: capability || null,
        requested_payload: decision.execution.payload,
      },
      decision: {
        ...decision,
        agreement_state: nextAgreementState,
        intent: capability ? "plan" : "clarify",
        response_text:
          needsConfirmation && capability
            ? `${decision.response_text} Should I proceed with that action?`
            : capability
              ? `${decision.response_text} This capability is connected, but automatic execution is not enabled for it yet.`
              : `${decision.response_text} I could not match that action to an Operator-enabled business capability.`,
        clarification: {
          required: !capability || needsConfirmation,
          question:
            needsConfirmation && capability
              ? "Should I proceed with that exact action?"
              : !capability
                ? "Do you want me to help refine the request or open the relevant workspace?"
                : null,
          options:
            needsConfirmation && capability
              ? [
                  { id: "confirm", label: "Yes, proceed" },
                  { id: "cancel", label: "No, cancel" },
                ]
              : [],
        },
      },
    };
  }

  let result;

  try {
    result = await executeCapability({
      capability,
      payload: decision.execution.payload,
      organizationId,
      entityId,
      periodId,
      partyId,
      actor,
      permissions,
      source,
      callerRequest,
    });
  } catch (executionError) {
    if (!executionError?.operatorGovernance) throw executionError;

    const governance = executionError.operatorGovernance;
    const pendingApprovalState = agreementWithPendingConfirmationRun({
      agreementState: decision.agreement_state,
      capability,
      payload: decision.execution.payload,
      reason: decision.execution.reason,
      originalMessage: message,
      objective:
        text(decision.project_state?.objective) ||
        text(projectState?.objective) ||
        text(message),
      approvalRequestId: governance.approvalRequest?.id,
    });
    const governanceState = approvalRunTransition(
      pendingApprovalState,
      governance,
    );

    return {
      ...response,
      agreement_state: governanceState,
      execution: {
        status: "blocked",
        reason: governance.reason,
        capability: {
          key: capability.key,
          domain: capability.domain,
          capability: capability.capability,
          action: capability.action,
          mode: capability.mode,
        },
        requested_payload: decision.execution.payload,
        approval_request: governance.approvalRequest || null,
      },
      decision: {
        ...decision,
        agreement_state: governanceState,
        intent: "answer",
        response_text: governanceBlockText(governance.reason),
        clarification: {
          required: false,
          question: null,
          options: [],
        },
      },
    };
  }

  if (isMissionExecutionResult(capability, result)) {
    return missionResultTurn({
      result,
      capability,
      agreementState: decision.agreement_state,
      projectState: decision.project_state || projectState,
      locale,
      currentScreen,
      navigationTargetCount: navigationTargets.length,
      executableCapabilityCount: capabilities.length,
      originalMessage: message,
      objective:
        text(decision.project_state?.objective) ||
        text(projectState?.objective) ||
        text(message),
      resumedRun: false,
    });
  }

  let verifiedDecision = decision;
  let verificationEvidence = null;

  try {
    const verification = await verifyOperatorExecution({
      organizationId,
      partyId,
      entityId,
      locale,
      timezone,
      originalMessage: message,
      source,
      currentScreen,
      agreementState: decision.agreement_state,
      projectState: {
        ...object(projectState),
        ...object(decision.project_state),
      },
      conversation,
      capability,
      result,
    });

    verifiedDecision = verification.decision;
    verificationEvidence = verification.provider_evidence;
  } catch (verificationError) {
    console.error("OPERATOR_VERIFICATION_ERROR", verificationError);
  }

  return {
    ...response,
    agreement_state:
      verifiedDecision.agreement_state || decision.agreement_state,
    provider_evidence: {
      planning: reasoning.provider_evidence,
      verification: verificationEvidence,
    },
    execution: {
      status: "completed",
      capability: {
        key: capability.key,
        domain: capability.domain,
        capability: capability.capability,
        action: capability.action,
        mode: capability.mode,
      },
      result,
    },
    decision: {
      ...verifiedDecision,
      response_text:
        verifiedDecision.response_text ||
        "Done. The requested Avantiqo action completed successfully.",
    },
  };
}
