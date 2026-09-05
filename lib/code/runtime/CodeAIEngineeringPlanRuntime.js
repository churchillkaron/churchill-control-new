import crypto from "node:crypto";

import {
  projectCodeProductCompletionCriteria,
} from "./CodeProductCompletionCriteriaRuntime.js";

export const CODE_AI_ENGINEERING_PLAN_CONTRACT =
  "AVANTIQO_CODE_AI_ENGINEERING_PLAN_V1";

const MAX_TASKS = 14;
const MAX_REVISION_REASONS = 8;
const DISCOVERY_ACTIONS = new Set(["inspect", "search", "read"]);
const MUTATION_ACTIONS = new Set(["apply_files", "delete_files", "rename_files"]);

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function unique(values) {
  return [...new Set(list(values).map((item) => text(item, 1000)).filter(Boolean))];
}

function operationEvidence(state = {}) {
  return list(state.evidence).filter((entry) =>
    entry?.kind === "operation" && text(entry?.status, 80) === "completed"
  );
}

function completedActions(state = {}) {
  return operationEvidence(state).map((entry) => text(entry?.action, 80).toLowerCase());
}

function latestSuccessfulVerification(state = {}) {
  const passed = list(state.verification).filter((entry) => entry?.passed === true);
  return passed.length ? passed[passed.length - 1] : null;
}

function finalDiffObserved(state = {}) {
  return Boolean(
    text(state.patch, 1) &&
    operationEvidence(state).some((entry) => text(entry?.action, 80) === "diff")
  );
}

function productCriteria(state = {}) {
  return projectCodeProductCompletionCriteria(state);
}

function acceptanceTasks(state = {}) {
  const projection = productCriteria(state);
  if (!projection.required) return [];
  return list(projection.criteria_evidence).map((entry, index) => {
    const evidenceIds = unique(entry?.evidence_operation_ids).slice(0, 12);
    return {
      id: `acceptance-C${index + 1}`,
      phase: "BUSINESS_ACCEPTANCE",
      title: text(entry?.criterion, 700) || `Acceptance criterion C${index + 1}`,
      criterion_id: `C${index + 1}`,
      status: evidenceIds.length ? "COMPLETED" : "PENDING",
      evidence_operation_ids: evidenceIds,
      source: "BOUND_PRODUCT_COMPLETION_CRITERIA",
      business_outcome: true,
    };
  });
}

function coreTasks(state = {}) {
  const actions = completedActions(state);
  const discoveryComplete = actions.some((action) => DISCOVERY_ACTIONS.has(action));
  const mutationComplete = unique(state.files_changed).length > 0 ||
    actions.some((action) => MUTATION_ACTIONS.has(action));
  const verificationComplete = Boolean(latestSuccessfulVerification(state));
  const diffComplete = finalDiffObserved(state);
  const qualityVerified = state?.worldclass_quality?.verified === true ||
    state?.employee_completion?.worldclass_quality?.verified === true;

  return [
    {
      id: "understand-current-repository",
      phase: "REPOSITORY_UNDERSTANDING",
      title: "Inspect current repository evidence and constraints",
      status: discoveryComplete ? "COMPLETED" : "IN_PROGRESS",
      evidence_count: operationEvidence(state).filter((entry) =>
        DISCOVERY_ACTIONS.has(text(entry?.action, 80).toLowerCase())
      ).length,
      business_outcome: false,
    },
    {
      id: "implement-bounded-change",
      phase: "IMPLEMENTATION",
      title: "Implement the smallest coherent change that satisfies the objective",
      status: mutationComplete ? "COMPLETED" : discoveryComplete ? "IN_PROGRESS" : "PENDING",
      changed_files: unique(state.files_changed).slice(0, 40),
      business_outcome: false,
    },
    {
      id: "verify-current-behavior",
      phase: "VERIFICATION",
      title: "Run fresh verification against the current implementation",
      status: verificationComplete ? "COMPLETED" : mutationComplete ? "IN_PROGRESS" : "PENDING",
      latest_verification_operation_id:
        text(latestSuccessfulVerification(state)?.operation_id, 200) || null,
      business_outcome: false,
    },
    {
      id: "final-quality-review",
      phase: "FINAL_REVIEW",
      title: "Review final diff and world-class quality gates",
      status: diffComplete && qualityVerified
        ? "COMPLETED"
        : verificationComplete
          ? "IN_PROGRESS"
          : "PENDING",
      final_diff_observed: diffComplete,
      worldclass_quality_verified: qualityVerified,
      business_outcome: false,
    },
  ];
}

function blockersTask(state = {}) {
  const blockers = unique(state.blockers);
  if (!blockers.length) return [];
  return [{
    id: "resolve-current-blockers",
    phase: "BLOCKER_RESOLUTION",
    title: "Resolve current governed blockers before completion",
    status: "IN_PROGRESS",
    blockers: blockers.slice(0, 20),
    business_outcome: false,
  }];
}

function planStatus(tasks = [], state = {}) {
  const acceptance = tasks.filter((task) => task.phase === "BUSINESS_ACCEPTANCE");
  const incompleteAcceptance = acceptance.filter((task) => task.status !== "COMPLETED");
  if (state?.employee_completion?.complete === true || state?.status === "completed" && tasks.every((task) => task.status === "COMPLETED")) {
    return "COMPLETE";
  }
  if (unique(state.blockers).length) return "BLOCKED";
  const current = tasks.find((task) => task.status === "IN_PROGRESS");
  if (current) return current.phase;
  if (incompleteAcceptance.length) return "BUSINESS_ACCEPTANCE";
  return "PLANNED";
}

function phaseProgress(tasks = []) {
  const phases = [
    "REPOSITORY_UNDERSTANDING",
    "IMPLEMENTATION",
    "VERIFICATION",
    "BUSINESS_ACCEPTANCE",
    "FINAL_REVIEW",
    "BLOCKER_RESOLUTION",
  ];
  return phases
    .map((phase) => {
      const phaseTasks = tasks.filter((task) => task.phase === phase);
      if (!phaseTasks.length) return null;
      const completed = phaseTasks.filter((task) => task.status === "COMPLETED").length;
      const inProgress = phaseTasks.filter((task) => task.status === "IN_PROGRESS").length;
      return {
        phase,
        task_count: phaseTasks.length,
        completed_count: completed,
        in_progress_count: inProgress,
        status: completed === phaseTasks.length
          ? "COMPLETED"
          : inProgress > 0
            ? "IN_PROGRESS"
            : "PENDING",
      };
    })
    .filter(Boolean);
}

function fingerprint(value) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex")
    .slice(0, 40);
}

function ownerInterventionFingerprint(intervention = {}) {
  const source = object(intervention);
  const action = text(source.action, 80);
  const instruction = text(source.instruction, 2000);
  if (!action && !instruction) return null;
  return fingerprint({ action, instruction });
}

function snapshot(state = {}, ownerIntervention = null) {
  const acceptance = productCriteria(state);
  const successfulVerification = latestSuccessfulVerification(state);
  return {
    base_commit: text(state.base_commit, 160) || null,
    files_changed: unique(state.files_changed).sort(),
    completed_operation_ids: unique(state.completed_operation_ids).sort(),
    latest_verification_operation_id:
      text(successfulVerification?.operation_id, 200) || null,
    latest_verification_passed: Boolean(successfulVerification),
    blocker_set: unique(state.blockers).sort(),
    acceptance_evidence: list(acceptance.criteria_evidence).map((entry) => ({
      criterion: text(entry?.criterion, 700),
      evidence_operation_ids: unique(entry?.evidence_operation_ids).sort(),
    })),
    final_diff_observed: finalDiffObserved(state),
    worldclass_quality_verified:
      state?.worldclass_quality?.verified === true ||
      state?.employee_completion?.worldclass_quality?.verified === true,
    owner_intervention_fingerprint: ownerInterventionFingerprint(
      ownerIntervention || state.owner_intervention,
    ),
  };
}

function sameList(left, right) {
  const a = list(left);
  const b = list(right);
  return a.length === b.length && a.every((value, index) => JSON.stringify(value) === JSON.stringify(b[index]));
}

function revisionReasons(previous = {}, current = {}) {
  if (!Object.keys(object(previous)).length) return ["INITIAL_PLAN_CREATED"];
  const reasons = [];
  if (text(previous.base_commit, 160) !== text(current.base_commit, 160)) {
    reasons.push("REPOSITORY_HEAD_CHANGED");
  }
  if (!sameList(previous.files_changed, current.files_changed)) {
    reasons.push("FILE_SET_CHANGED");
  }
  if (previous.latest_verification_operation_id !== current.latest_verification_operation_id ||
      previous.latest_verification_passed !== current.latest_verification_passed) {
    reasons.push("VERIFICATION_EVIDENCE_CHANGED");
  }
  if (!sameList(previous.acceptance_evidence, current.acceptance_evidence)) {
    reasons.push("BUSINESS_ACCEPTANCE_EVIDENCE_CHANGED");
  }
  if (!sameList(previous.blocker_set, current.blocker_set)) {
    reasons.push("BLOCKERS_CHANGED");
  }
  if (previous.final_diff_observed !== current.final_diff_observed ||
      previous.worldclass_quality_verified !== current.worldclass_quality_verified) {
    reasons.push("FINAL_REVIEW_EVIDENCE_CHANGED");
  }
  if (previous.owner_intervention_fingerprint !== current.owner_intervention_fingerprint) {
    reasons.push("OWNER_STEERING_CHANGED");
  }
  return reasons.slice(0, MAX_REVISION_REASONS);
}

function currentPriority(tasks = []) {
  const blocker = tasks.find((task) => task.phase === "BLOCKER_RESOLUTION" && task.status !== "COMPLETED");
  if (blocker) return blocker;
  return tasks.find((task) => task.status === "IN_PROGRESS") ||
    tasks.find((task) => task.status === "PENDING") ||
    tasks[tasks.length - 1] || null;
}

export function reconcileCodeAIEngineeringPlan({
  objective,
  ownerIntent = null,
  state = {},
  previousPlan = null,
  ownerIntervention = null,
} = {}) {
  const source = object(state);
  const previous = object(previousPlan || source.engineering_plan);
  const currentSnapshot = snapshot(source, ownerIntervention);
  const currentFingerprint = fingerprint(currentSnapshot);
  const previousFingerprint = text(previous.evidence_fingerprint, 80);
  const changed = !previousFingerprint || previousFingerprint !== currentFingerprint;
  const reasons = changed
    ? revisionReasons(object(previous.evidence_snapshot), currentSnapshot)
    : [];

  const tasks = [
    ...coreTasks(source),
    ...acceptanceTasks(source),
    ...blockersTask(source),
  ].slice(0, MAX_TASKS);
  const completedCount = tasks.filter((task) => task.status === "COMPLETED").length;
  const priority = currentPriority(tasks);
  const revision = changed
    ? Math.max(1, Number(previous.revision || 0) + 1)
    : Math.max(1, Number(previous.revision || 1));
  const acceptance = productCriteria(source);
  const explicitAcceptance = acceptance.required === true;

  return {
    contract: CODE_AI_ENGINEERING_PLAN_CONTRACT,
    plan_id:
      text(previous.plan_id, 160) ||
      `code-plan:${fingerprint({
        mission_id: text(source.mission_id, 240),
        objective: text(ownerIntent || source?.employee_mission?.owner_intent || objective || source.objective, 5000),
      }).slice(0, 28)}`,
    mission_id: text(source.mission_id, 240) || null,
    objective: text(objective || source.objective, 5000) || null,
    owner_intent:
      text(ownerIntent || source?.employee_mission?.owner_intent || source.owner_intent, 5000) || null,
    repository_url: text(source.repository_url, 1000) || null,
    ref: text(source.ref, 160) || null,
    base_commit: text(source.base_commit, 160) || null,
    revision,
    revised: changed,
    revision_reasons: reasons,
    previous_revision: previous.revision ? Number(previous.revision) : null,
    evidence_fingerprint: currentFingerprint,
    evidence_snapshot: currentSnapshot,
    status: planStatus(tasks, source),
    current_phase: priority?.phase || "FINAL_REVIEW",
    current_priority_task_id: priority?.id || null,
    current_priority: priority?.title || null,
    task_count: tasks.length,
    completed_task_count: completedCount,
    progress_percent: tasks.length
      ? Math.round((completedCount / tasks.length) * 100)
      : 0,
    phases: phaseProgress(tasks),
    tasks,
    business_acceptance: {
      explicit_criteria_bound: explicitAcceptance,
      criteria_count: Number(acceptance.criteria_count || 0),
      evidence_count: Number(acceptance.evidence_count || 0),
      verified: acceptance.verified === true,
      criteria: list(acceptance.criteria).slice(0, 6),
      authority: explicitAcceptance
        ? "BOUND_PRODUCT_COMPLETION_CRITERIA"
        : "OWNER_OBJECTIVE_PLUS_ENGINEERING_QUALITY_GATES",
    },
    owner_steering_applied: Boolean(ownerIntervention?.instruction || source?.owner_intervention?.instruction),
    owner_steering_action:
      text(ownerIntervention?.action || source?.owner_intervention?.action, 80) || null,
    owner_steering_instruction_persisted_in_plan: false,
    dynamic_reconciliation: true,
    static_plan: false,
    repository_evidence_authoritative: true,
    business_outcome_progress_primary: true,
    plan_is_execution_authority: false,
    plan_is_commit_authority: false,
    plan_is_deploy_authority: false,
    raw_reasoning_persisted: false,
    chain_of_thought_exposed: false,
    authorization_effect: "NONE",
    updated_at: new Date().toISOString(),
  };
}

export function bindCodeAIEngineeringPlanToState(state = {}, plan = {}) {
  const source = object(state);
  const previous = object(source.engineering_plan);
  const shouldRecordRevision =
    !previous.contract || Number(previous.revision || 0) !== Number(plan.revision || 0);
  return {
    ...source,
    engineering_plan: object(plan),
    evidence: shouldRecordRevision
      ? [
          ...list(source.evidence),
          {
            at: new Date().toISOString(),
            kind: "engineering_plan_revision",
            contract: CODE_AI_ENGINEERING_PLAN_CONTRACT,
            revision: Number(plan.revision || 1),
            revision_reasons: list(plan.revision_reasons).slice(0, MAX_REVISION_REASONS),
            status: text(plan.status, 100) || null,
            current_phase: text(plan.current_phase, 120) || null,
            progress_percent: Number(plan.progress_percent || 0),
            business_acceptance_verified: plan?.business_acceptance?.verified === true,
            owner_steering_applied: plan?.owner_steering_applied === true,
            repository_evidence_authoritative: true,
            provider_execution_submitted: false,
            source_mutation_performed: false,
            raw_reasoning_persisted: false,
            authorization_effect: "NONE",
          },
        ].slice(-120)
      : list(source.evidence),
  };
}

export function formatCodeAIEngineeringPlanForObjective(plan = {}) {
  const source = object(plan);
  if (!source.contract) return "";
  const currentTasks = list(source.tasks)
    .filter((task) => task.status !== "COMPLETED")
    .slice(0, 6);
  const lines = [
    "GOVERNED ENGINEERING PLAN (DYNAMIC, EVIDENCE-RECONCILED):",
    `Plan revision ${Number(source.revision || 1)} · ${Number(source.progress_percent || 0)}% complete · current phase ${text(source.current_phase, 120) || "PLANNED"}.`,
  ];
  if (list(source.revision_reasons).length) {
    lines.push(`Revision reasons: ${list(source.revision_reasons).join(", ")}.`);
  }
  if (source.current_priority) lines.push(`Current priority: ${text(source.current_priority, 1000)}.`);
  if (currentTasks.length) {
    lines.push("Remaining plan tasks:");
    for (const task of currentTasks) {
      lines.push(`- [${task.status}] ${task.phase}: ${text(task.title, 1000)}`);
    }
  }
  if (source?.business_acceptance?.explicit_criteria_bound === true) {
    lines.push(
      `Business acceptance: ${Number(source.business_acceptance.evidence_count || 0)}/${Number(source.business_acceptance.criteria_count || 0)} criteria have observed evidence.`,
    );
  }
  lines.push(
    "Use this plan as an inspectable coordination artifact, not as permission. Revise it from actual repository evidence after this package. Current HEAD, explicit acceptance criteria, verification and governance remain authoritative.",
  );
  return lines.join("\n");
}

export function compactCodeAIEngineeringPlan(plan = {}) {
  const source = object(plan);
  if (!source.contract) return null;
  return {
    contract: CODE_AI_ENGINEERING_PLAN_CONTRACT,
    plan_id: text(source.plan_id, 160) || null,
    revision: Number(source.revision || 1),
    revised: source.revised === true,
    revision_reasons: list(source.revision_reasons).slice(0, MAX_REVISION_REASONS),
    status: text(source.status, 100) || null,
    current_phase: text(source.current_phase, 120) || null,
    current_priority: text(source.current_priority, 1000) || null,
    task_count: Number(source.task_count || 0),
    completed_task_count: Number(source.completed_task_count || 0),
    progress_percent: Number(source.progress_percent || 0),
    phases: list(source.phases).slice(0, 8),
    tasks: list(source.tasks).slice(0, MAX_TASKS).map((task) => ({
      id: text(task?.id, 200) || null,
      phase: text(task?.phase, 120) || null,
      title: text(task?.title, 1000) || null,
      status: text(task?.status, 80) || null,
      criterion_id: text(task?.criterion_id, 40) || null,
      evidence_operation_count: list(task?.evidence_operation_ids).length,
      business_outcome: task?.business_outcome === true,
    })),
    business_acceptance: {
      explicit_criteria_bound: source?.business_acceptance?.explicit_criteria_bound === true,
      criteria_count: Number(source?.business_acceptance?.criteria_count || 0),
      evidence_count: Number(source?.business_acceptance?.evidence_count || 0),
      verified: source?.business_acceptance?.verified === true,
      authority: text(source?.business_acceptance?.authority, 120) || null,
    },
    owner_steering_applied: source.owner_steering_applied === true,
    owner_steering_action: text(source.owner_steering_action, 80) || null,
    owner_steering_instruction_persisted_in_plan: false,
    dynamic_reconciliation: true,
    repository_evidence_authoritative: true,
    business_outcome_progress_primary: true,
    chain_of_thought_exposed: false,
    authorization_effect: "NONE",
  };
}

export const CodeAIEngineeringPlanRuntime = Object.freeze({
  contract: CODE_AI_ENGINEERING_PLAN_CONTRACT,
  reconcile: reconcileCodeAIEngineeringPlan,
  bindToState: bindCodeAIEngineeringPlanToState,
  formatForObjective: formatCodeAIEngineeringPlanForObjective,
  compact: compactCodeAIEngineeringPlan,
  dynamic_reconciliation: true,
  repository_evidence_authoritative: true,
  business_outcome_progress_primary: true,
  static_plan: false,
  owner_steering_revises_plan: true,
  owner_steering_instruction_persisted_in_plan: false,
  chain_of_thought_exposed: false,
  authorization_effect: "NONE",
});

export default CodeAIEngineeringPlanRuntime;
