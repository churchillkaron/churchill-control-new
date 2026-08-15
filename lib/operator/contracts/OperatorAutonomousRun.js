const RUN_STATUSES = new Set([
  "active",
  "awaiting_confirmation",
  "awaiting_approval",
  "executing",
  "verifying",
  "blocked",
  "completed",
  "cancelled",
  "superseded",
]);

const STEP_STATUSES = new Set([
  "planned",
  "running",
  "awaiting_confirmation",
  "awaiting_approval",
  "completed",
  "failed",
  "cancelled",
  "superseded",
]);

const STEP_KINDS = new Set(["read", "action", "verify"]);
const MAX_RUN_STEPS = 6;

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

function nowIso() {
  return new Date().toISOString();
}

function runId() {
  const random = Math.random().toString(36).slice(2, 10);
  return `operator_run_${Date.now()}_${random}`;
}

function normalizeStep(step, index) {
  const candidate = object(step);
  const kind = text(candidate.kind).toLowerCase();
  const status = text(candidate.status).toLowerCase();

  return {
    id: text(candidate.id) || `step_${index + 1}`,
    kind: STEP_KINDS.has(kind) ? kind : "read",
    description:
      text(candidate.description || candidate.label) || `Step ${index + 1}`,
    capability_key: text(candidate.capability_key) || null,
    status: STEP_STATUSES.has(status) ? status : "planned",
  };
}

export function normalizeOperatorAutonomousRun(value = {}) {
  const candidate = object(value);
  const runStatus = text(candidate.status).toLowerCase();
  const plannedSteps = list(candidate.planned_steps)
    .slice(0, MAX_RUN_STEPS)
    .map(normalizeStep);
  const plannedIds = new Set(plannedSteps.map((step) => step.id));
  const completedSteps = Array.from(
    new Set(
      list(candidate.completed_steps)
        .map(text)
        .filter((id) => id && plannedIds.has(id)),
    ),
  ).slice(0, MAX_RUN_STEPS);
  const terminal = ["completed", "cancelled", "superseded"].includes(runStatus);

  return {
    run_id: text(candidate.run_id) || runId(),
    objective: text(candidate.objective).slice(0, 1200) || null,
    status: RUN_STATUSES.has(runStatus) ? runStatus : "active",
    planned_steps: plannedSteps,
    completed_steps: completedSteps,
    current_step_id: terminal
      ? null
      : text(candidate.current_step_id) || null,
    blocker: text(candidate.blocker).slice(0, 800) || null,
    created_at: text(candidate.created_at) || nowIso(),
    updated_at: nowIso(),
  };
}

export function createOperatorAutonomousRun({
  objective,
  evidenceSteps = [],
  pendingExecution,
} = {}) {
  const action = object(pendingExecution);
  const readSteps = list(evidenceSteps).slice(0, 4).map((step, index) => ({
    id: text(step?.id) || `evidence_${index + 1}`,
    kind: "read",
    description:
      text(step?.label || step?.description) || `Evidence read ${index + 1}`,
    capability_key: text(step?.capability_key) || null,
    status: text(step?.status).toLowerCase() === "completed" ? "completed" : "failed",
  }));

  const actionStep = {
    id: "requested_action",
    kind: "action",
    description: text(action.description) || "Run the requested business action",
    capability_key: text(action.capability_key) || null,
    status: "awaiting_confirmation",
  };

  const verifyAfter = object(action.verify_after);
  const verificationStep = text(verifyAfter.capability_key)
    ? {
        id: "post_action_verification",
        kind: "verify",
        description:
          text(verifyAfter.description) || "Verify the business effect",
        capability_key: text(verifyAfter.capability_key),
        status: "planned",
      }
    : null;

  const plannedSteps = [...readSteps, actionStep, ...(verificationStep ? [verificationStep] : [])]
    .slice(0, MAX_RUN_STEPS);

  return normalizeOperatorAutonomousRun({
    run_id: runId(),
    objective,
    status: "awaiting_confirmation",
    planned_steps: plannedSteps,
    completed_steps: readSteps
      .filter((step) => step.status === "completed")
      .map((step) => step.id),
    current_step_id: actionStep.id,
    blocker: null,
    created_at: nowIso(),
  });
}

export function transitionOperatorAutonomousRun(
  value,
  {
    status,
    currentStepId,
    stepId,
    stepStatus,
    blocker = null,
  } = {},
) {
  const run = normalizeOperatorAutonomousRun(value);
  const nextStatus = text(status).toLowerCase();
  const nextStepStatus = text(stepStatus).toLowerCase();
  const targetStepId = text(stepId);

  const plannedSteps = run.planned_steps.map((step) =>
    targetStepId && step.id === targetStepId
      ? {
          ...step,
          status: STEP_STATUSES.has(nextStepStatus)
            ? nextStepStatus
            : step.status,
        }
      : step,
  );

  const completedSteps = Array.from(
    new Set([
      ...run.completed_steps,
      ...plannedSteps
        .filter((step) => step.status === "completed")
        .map((step) => step.id),
    ]),
  ).slice(0, MAX_RUN_STEPS);
  const resolvedStatus = RUN_STATUSES.has(nextStatus) ? nextStatus : run.status;
  const terminal = ["completed", "cancelled", "superseded"].includes(resolvedStatus);

  return normalizeOperatorAutonomousRun({
    ...run,
    status: resolvedStatus,
    planned_steps: plannedSteps,
    completed_steps: completedSteps,
    current_step_id: terminal
      ? null
      : text(currentStepId) || run.current_step_id,
    blocker,
  });
}

export function autonomousRunFromAgreementState(agreementState = {}) {
  const run = object(agreementState?.autonomous_run);
  return text(run.run_id) ? normalizeOperatorAutonomousRun(run) : null;
}

export function agreementWithAutonomousRun(agreementState = {}, run = null) {
  const next = { ...object(agreementState) };
  if (run) next.autonomous_run = normalizeOperatorAutonomousRun(run);
  else delete next.autonomous_run;
  return next;
}

export const OPERATOR_AUTONOMOUS_RUN_MAX_STEPS = MAX_RUN_STEPS;
