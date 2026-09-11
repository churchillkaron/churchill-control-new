import {
  agreementWithAutonomousRun,
  autonomousRunFromAgreementState,
  transitionOperatorAutonomousRun,
} from "../contracts/OperatorAutonomousRun.js";

export const OPERATOR_MISSION_REPLAN_CONTINUITY_CONTRACT =
  "AVANTIQO_OPERATOR_MISSION_REPLAN_CONTINUITY_V1";

const DEFAULT_MAX_REPLANS = 3;
const HARD_MAX_REPLANS = 6;
const REPLAN_REQUESTS = new Set([
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
]);
const PROJECT_STATUS_BY_RUN_STATUS = Object.freeze({
  active: "active",
  executing: "active",
  verifying: "active",
  awaiting_confirmation: "awaiting_confirmation",
  awaiting_approval: "blocked",
  blocked: "blocked",
  completed: "active",
  cancelled: "cancelled",
  superseded: "active",
});
const PROGRESS_PREFIX = "Governed mission continuity:";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function normalizedUtterance(value) {
  return text(value, 1000)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u0e00-\u0e7f\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isBlockedMissionReplanRequest(value) {
  return REPLAN_REQUESTS.has(normalizedUtterance(value));
}

function missionRun(agreementState = {}) {
  const run = autonomousRunFromAgreementState(agreementState);
  return text(run?.run_kind, 40).toLowerCase() === "mission" ? run : null;
}

function currentMissionStep(run) {
  const id = text(run?.current_step_id, 120);
  return id
    ? list(run?.planned_steps).find((step) => text(step?.id, 120) === id) || null
    : null;
}

function validStoredReplanState(value = {}) {
  const source = object(value);
  if (!Object.keys(source).length) return null;
  if (text(source.contract, 180) !== OPERATOR_MISSION_REPLAN_CONTINUITY_CONTRACT) {
    return false;
  }
  const sourceRunId = text(source.source_run_id, 180);
  if (!sourceRunId) return false;
  return {
    contract: OPERATOR_MISSION_REPLAN_CONTINUITY_CONTRACT,
    lineage_id: text(source.lineage_id, 180) || sourceRunId,
    source_run_id: sourceRunId,
    revision: boundedInteger(source.revision, 0, 0, HARD_MAX_REPLANS),
    max_replans: boundedInteger(
      source.max_replans,
      DEFAULT_MAX_REPLANS,
      0,
      HARD_MAX_REPLANS,
    ),
    status: text(source.status, 80) || "blocked",
    last_reason: text(source.last_reason, 1000) || null,
    updated_at: text(source.updated_at, 100) || null,
    execution_authority: "NONE",
    mutation_replay_allowed: false,
  };
}

function newReplanState(run, inherited = null) {
  const previous = inherited && inherited !== false ? inherited : null;
  return {
    contract: OPERATOR_MISSION_REPLAN_CONTINUITY_CONTRACT,
    lineage_id: text(previous?.lineage_id, 180) || text(run?.run_id, 180),
    source_run_id: text(run?.run_id, 180),
    revision: boundedInteger(previous?.revision, 0, 0, HARD_MAX_REPLANS),
    max_replans: boundedInteger(
      previous?.max_replans,
      DEFAULT_MAX_REPLANS,
      0,
      HARD_MAX_REPLANS,
    ),
    status: text(run?.status, 80) || "active",
    last_reason: text(run?.blocker, 1000) || text(previous?.last_reason, 1000) || null,
    updated_at: new Date().toISOString(),
    execution_authority: "NONE",
    mutation_replay_allowed: false,
  };
}

function missionSummary(run, replanState, statusOverride = null) {
  const step = currentMissionStep(run);
  const completed = list(run?.completed_steps)
    .map((item) => text(item, 120))
    .filter(Boolean)
    .slice(0, 6);
  const total = list(run?.planned_steps).length;
  const status = text(statusOverride, 80) || text(run?.status, 80) || "active";
  const revision = boundedInteger(replanState?.revision, 0, 0, HARD_MAX_REPLANS);
  const maxReplans = boundedInteger(
    replanState?.max_replans,
    DEFAULT_MAX_REPLANS,
    0,
    HARD_MAX_REPLANS,
  );
  const details = [
    `run=${text(run?.run_id, 180) || "unknown"}`,
    `status=${status}`,
    `completed=${completed.length}/${total}`,
    step?.id ? `current_step=${text(step.id, 120)}` : null,
    step?.description ? `current=${text(step.description, 500)}` : null,
    text(run?.blocker, 600) ? `blocker=${text(run.blocker, 600)}` : null,
    `replan=${revision}/${maxReplans}`,
  ]
    .filter(Boolean)
    .join("; ");
  return `${PROGRESS_PREFIX} ${details}. Completed history is immutable continuity, not reusable write authority. A replacement plan must use current evidence and pass normal confirmation, approval, permission, wallet and verification governance; prior mutations must never be replayed merely because the mission is being replanned.`.slice(
    0,
    1200,
  );
}

function projectWithMissionSummary(projectState, run, replanState, statusOverride = null) {
  const current = object(projectState);
  const existingSummary = text(current.progress_summary, 1200)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith(PROGRESS_PREFIX))
    .join("\n");
  const summary = missionSummary(run, replanState, statusOverride);
  const status = text(statusOverride || run?.status, 80).toLowerCase();
  const step = currentMissionStep(run);
  const blocked = status === "blocked";
  const replanning = status === "replanning";
  const mappedStatus = PROJECT_STATUS_BY_RUN_STATUS[status] || current.status || "active";

  return {
    ...current,
    objective: text(current.objective, 600) || text(run?.objective, 600) || null,
    status: mappedStatus,
    progress_summary: [existingSummary, summary]
      .filter(Boolean)
      .join("\n")
      .slice(0, 1200),
    blocker: blocked
      ? text(run?.blocker, 600) || "Governed mission step blocked"
      : replanning
        ? null
        : current.blocker ?? null,
    next_step: blocked
      ? `Replan from current verified mission history without skipping ${text(step?.description, 420) || "the blocked step"} or replaying any completed mutation.`.slice(0, 600)
      : replanning
        ? "Use current evidence to form the next governed plan; all new mutations require their normal authority and verification gates."
        : current.next_step ?? null,
  };
}

function replanInstruction(run, state) {
  const step = currentMissionStep(run);
  const completed = list(run?.completed_steps)
    .map((item) => text(item, 120))
    .filter(Boolean)
    .join(", ") || "none";
  return [
    `Continue the project by replanning from the blocked governed mission toward this objective: ${text(run?.objective, 1200) || "complete the current project goal"}.`,
    `Blocked mission step: ${text(step?.description, 800) || text(run?.current_step_id, 120) || "unknown"}.`,
    `Current blocker: ${text(run?.blocker, 1000) || "unknown blocker"}.`,
    `Completed mission step ids that must remain historical and must not be replayed: ${completed}.`,
    `This is bounded replan revision ${state.revision} of ${state.max_replans}. Reassess current evidence and choose the safest useful replacement path toward the same goal.`,
    "Do not skip confirmation, approval, permission, wallet, scope, entity, or verification gates. Do not reuse prior approval or confirmation as authority for a replacement mutation. Do not replay a completed or uncertain mutation. A new mutation must be bound and governed as a new action.",
  ].join("\n");
}

export function prepareBlockedMissionReplan(options = {}) {
  const source = object(options);
  const agreementState = object(source.agreementState);
  const run = missionRun(agreementState);
  const pending = object(agreementState.pending_execution);
  const storedRaw = Object.prototype.hasOwnProperty.call(
    agreementState,
    "mission_replan",
  )
    ? agreementState.mission_replan
    : null;
  const stored = validStoredReplanState(storedRaw);

  const base = {
    options: source,
    replan: null,
    eligible: false,
    budget_exhausted: false,
    reason: null,
  };

  if (!run || text(run.status, 80).toLowerCase() !== "blocked") {
    return { ...base, reason: "BLOCKED_MISSION_REQUIRED" };
  }
  if (!isBlockedMissionReplanRequest(source.message)) {
    return { ...base, reason: "EXPLICIT_REPLAN_CONTINUATION_REQUIRED" };
  }
  if (text(pending.capability_key, 300)) {
    return { ...base, reason: "PENDING_EXECUTION_MUST_RESUME_EXACTLY" };
  }
  if (stored === false) {
    return { ...base, reason: "MISSION_REPLAN_STATE_INVALID" };
  }
  if (stored && stored.source_run_id !== text(run.run_id, 180)) {
    return { ...base, reason: "MISSION_REPLAN_RUN_BINDING_MISMATCH" };
  }

  const current = newReplanState(run, stored || null);
  if (current.revision >= current.max_replans) {
    return {
      ...base,
      budget_exhausted: true,
      reason: "MISSION_REPLAN_BUDGET_EXHAUSTED",
    };
  }

  const nextState = {
    ...current,
    revision: current.revision + 1,
    status: "replanning",
    last_reason: text(run.blocker, 1000) || "Blocked mission requires replacement plan",
    updated_at: new Date().toISOString(),
  };
  const supersededRun = transitionOperatorAutonomousRun(run, {
    status: "superseded",
    currentStepId: run.current_step_id,
    stepId: run.current_step_id,
    stepStatus: "superseded",
    blocker: "Blocked mission superseded by bounded Intelligence replan",
  });
  const nextAgreementState = agreementWithAutonomousRun(
    {
      ...agreementState,
      mission_replan: nextState,
    },
    supersededRun,
  );
  const nextProjectState = projectWithMissionSummary(
    source.projectState,
    run,
    nextState,
    "replanning",
  );

  return {
    options: {
      ...source,
      message: replanInstruction(run, nextState),
      agreementState: nextAgreementState,
      projectState: nextProjectState,
    },
    replan: nextState,
    eligible: true,
    budget_exhausted: false,
    reason: "BLOCKED_MISSION_REPLAN_STARTED",
  };
}

export function attachMissionReplanContinuity(
  result = {},
  { options = {}, replan = null } = {},
) {
  const source = object(result);
  const decision = object(source.decision);
  const resultAgreement = object(
    source.agreement_state || decision.agreement_state,
  );
  const fallbackAgreement = object(options.agreementState);
  const agreementState = Object.keys(resultAgreement).length
    ? resultAgreement
    : fallbackAgreement;
  const run = missionRun(agreementState);
  const inheritedRaw = object(agreementState.mission_replan);
  const inheritedValidated = validStoredReplanState(inheritedRaw);
  const inherited = inheritedValidated && inheritedValidated !== false
    ? inheritedValidated
    : replan && object(replan);

  if (!run && !replan) return result;

  let nextAgreementState = agreementState;
  let nextProjectState = object(
    decision.project_state || options.projectState,
  );

  if (run) {
    const sameRun = inherited && inherited.source_run_id === text(run.run_id, 180);
    const lineageCarry = replan && object(replan);
    const seed = sameRun
      ? inherited
      : lineageCarry && lineageCarry !== false
        ? lineageCarry
        : null;
    const nextReplan = newReplanState(run, seed);
    nextReplan.source_run_id = text(run.run_id, 180);
    nextReplan.status = text(run.status, 80) || nextReplan.status;
    nextReplan.last_reason = text(run.blocker, 1000) || nextReplan.last_reason;
    nextReplan.updated_at = new Date().toISOString();
    nextAgreementState = {
      ...agreementState,
      mission_replan: nextReplan,
    };
    const statusOverride =
      replan &&
      text(run.run_id, 180) === text(replan.source_run_id, 180) &&
      text(run.status, 80).toLowerCase() === "superseded"
        ? "replanning"
        : null;
    nextProjectState = projectWithMissionSummary(
      nextProjectState,
      run,
      nextReplan,
      statusOverride,
    );
  } else if (replan) {
    const nextReplan = {
      ...object(replan),
      status: "replanned",
      updated_at: new Date().toISOString(),
      execution_authority: "NONE",
      mutation_replay_allowed: false,
    };
    nextAgreementState = {
      ...agreementState,
      mission_replan: nextReplan,
    };
  }

  return {
    ...source,
    agreement_state: nextAgreementState,
    decision: {
      ...decision,
      agreement_state: nextAgreementState,
      project_state: nextProjectState,
    },
    operator_catalog: {
      ...object(source.operator_catalog),
      mission_replan_continuity_contract:
        OPERATOR_MISSION_REPLAN_CONTINUITY_CONTRACT,
      mission_replan_revision:
        Number(nextAgreementState?.mission_replan?.revision || 0),
      mission_replan_max:
        Number(nextAgreementState?.mission_replan?.max_replans || DEFAULT_MAX_REPLANS),
      mission_replan_execution_authority: "NONE",
      mission_replan_mutation_replay_allowed: false,
    },
  };
}

export const OperatorMissionReplanContinuityRuntime = Object.freeze({
  contract: OPERATOR_MISSION_REPLAN_CONTINUITY_CONTRACT,
  isRequest: isBlockedMissionReplanRequest,
  prepare: prepareBlockedMissionReplan,
  attach: attachMissionReplanContinuity,
});

export default OperatorMissionReplanContinuityRuntime;
