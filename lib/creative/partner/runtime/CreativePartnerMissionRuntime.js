import {
  CreativeDirectorRuntime,
} from "@/lib/creative/director/runtime/CreativeDirectorRuntime";
import {
  ProductionRuntime,
} from "@/lib/creative/production/runtime/ProductionRuntime";
import {
  CreativeProductionHealthRuntime,
} from "@/lib/creative/production/runtime/CreativeProductionHealthRuntime";
import {
  CreativeStateEngine,
  PIPELINE_STAGES,
} from "@/lib/creative/state/CreativeStateEngine";

const CONTRACT = "AVANTIQO_CREATIVE_PARTNER_MISSION_V1";
const HUMAN_APPROVAL_STATUS = "AWAITING_PRODUCTION_DOSSIER_APPROVAL";
const ACTIVE_PRODUCTION_STAGES = new Set([
  PIPELINE_STAGES.PRODUCING,
  PIPELINE_STAGES.RENDERING,
  PIPELINE_STAGES.REVIEWING,
  PIPELINE_STAGES.MONITORING,
]);

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function stateRef(input = {}) {
  const organizationId = text(input.organization_id || input.organizationId);
  const missionId = text(
    input.creative_mission_id || input.creativeMissionId || input.mission_id,
  );
  const projectId = text(
    input.creative_project_id || input.creativeProjectId || input.project_id,
  );
  if (!organizationId) throw new Error("CREATIVE_PARTNER_ORGANIZATION_REQUIRED");
  if (!projectId) throw new Error("CREATIVE_PARTNER_PROJECT_REQUIRED");
  return {
    organization_id: organizationId,
    creative_mission_id: missionId || projectId,
    creative_project_id: projectId,
  };
}

function queueSummary(queue = {}) {
  return {
    total: Number(queue.total || 0),
    waiting: list(queue.waiting).length,
    ready: list(queue.ready).length,
    running: list(queue.running).length,
    review: list(queue.review).length,
    completed: list(queue.completed).length,
    failed: list(queue.failed).length,
    blocked: list(queue.blocked).length,
    superseded: list(queue.superseded).length,
  };
}

function humanReviewGates(queue = {}) {
  return list(queue.review)
    .filter((task) => task.review?.required === true && task.review?.approved !== true)
    .slice(0, 12)
    .map((task) => ({
      gate: "HUMAN_CREATIVE_REVIEW",
      task_id: task.id,
      title: text(task.title) || "Creative review",
      description: text(task.description) || null,
      scene_id: task.scene_id || null,
      shot_id: task.shot_id || null,
      review_contract: task.metadata?.contract || null,
    }));
}

function repairBlockSummary(production = {}) {
  return list(production?.repair_blocks || production?.repair_blocked)
    .slice(0, 12)
    .map((item) => ({
      task_id: item.task_id || null,
      reason: text(item.reason) || "AUTOMATIC_REPAIR_BLOCKED",
    }));
}

function finalisationPassed(production = {}) {
  const finalisation = production.finalisation || production.post_production;
  return Boolean(
    production.complete === true &&
    finalisation &&
    finalisation.success !== false &&
    finalisation.passed !== false,
  );
}

function missionStatus({ result, state, health }) {
  const production = object(result?.production);
  const queue = object(production.queue);
  const summary = queueSummary(queue);
  const dossierApproval = result?.status === HUMAN_APPROVAL_STATUS;
  const reviewGates = humanReviewGates(queue);
  const repairBlocks = repairBlockSummary(production);
  const completed = finalisationPassed(production) || result?.status === "COMPLETED";
  const humanDecisionRequired = dossierApproval || reviewGates.length > 0;
  const activeWork = summary.running > 0 || summary.ready > 0 || summary.waiting > 0;
  const internalProblem = summary.failed > 0 || summary.blocked > 0 || repairBlocks.length > 0;

  let nextAction = "CONTINUE_INTERNAL_PRODUCTION";
  if (completed) nextAction = "MISSION_COMPLETE";
  else if (dossierApproval) nextAction = "HUMAN_PRODUCTION_DOSSIER_DECISION";
  else if (reviewGates.length) nextAction = "HUMAN_CREATIVE_REVIEW";
  else if (summary.running > 0) nextAction = "MONITOR_RUNNING_WORKERS";
  else if (internalProblem) nextAction = "DIAGNOSE_AND_REPAIR";
  else if (activeWork) nextAction = "DISPATCH_NEXT_CAPABILITY";
  else nextAction = "RECHECK_FINALISATION";

  return {
    contract: CONTRACT,
    stage: state?.stage || null,
    status: completed
      ? "COMPLETED"
      : humanDecisionRequired
        ? "WAITING_FOR_HUMAN"
        : activeWork || internalProblem
          ? "WORKING"
          : "VERIFYING",
    next_action: nextAction,
    keep_working: !completed && !humanDecisionRequired,
    human_decision_required: humanDecisionRequired,
    human_gates: [
      ...(dossierApproval
        ? [{
            gate: "PRODUCTION_DOSSIER_APPROVAL",
            scope: "PRODUCTION_DOSSIER",
            estimated_cost: result?.approval?.estimated_cost ?? null,
            currency: result?.approval?.currency ?? null,
          }]
        : []),
      ...reviewGates,
    ],
    production: {
      ...summary,
      assets_created: Number(production.assets_created || 0),
      repair_attempts_created: Number(production.repair_total || 0),
      repair_blocks: repairBlocks,
      finalisation_status:
        production.finalisation?.status ||
        production.post_production?.status ||
        null,
      finalisation_passed: finalisationPassed(production),
    },
    health: health
      ? {
          status: health.status,
          failed_count: Number(health.failed_count || 0),
          stuck_count: Number(health.stuck_count || 0),
          running_count: Number(health.running_count || 0),
        }
      : null,
    execution_policy: "CAPABILITY_ONLY_SERVICE_RUNTIME_OWNED_FIRST",
    provider_selection_exposed: false,
    queue_management_exposed: false,
    retry_management_exposed: false,
    raw_reasoning_persisted: false,
  };
}

async function inspectHealth(ref) {
  try {
    return await CreativeProductionHealthRuntime.inspect({
      organization_id: ref.organization_id,
      window_hours: 24,
      stuck_minutes: 30,
    });
  } catch (error) {
    return {
      status: "unknown",
      failed_count: 0,
      stuck_count: 0,
      running_count: 0,
      diagnostic_error: text(error?.message),
    };
  }
}

async function resumeExistingProduction(ref) {
  const locked = await CreativeStateEngine.acquireExecutionLock(ref);
  if (!locked) {
    return {
      success: false,
      status: "PIPELINE_ALREADY_RUNNING",
      production: null,
      resumed_existing_production: true,
    };
  }

  try {
    const production = await ProductionRuntime.runProduction({
      organization_id: ref.organization_id,
      creative_mission_id: ref.creative_mission_id,
      creative_project_id: ref.creative_project_id,
    });
    return {
      success: production.success !== false,
      status: production.status,
      workflow_kind: null,
      production,
      resumed_existing_production: true,
      planning_replayed: false,
    };
  } finally {
    await CreativeStateEngine.releaseExecutionLock(ref);
  }
}

export const CreativePartnerMissionRuntime = Object.freeze({
  contract: CONTRACT,

  async advance(input = {}) {
    const ref = stateRef(input);
    const state = await CreativeStateEngine.init({
      ...ref,
      stage: PIPELINE_STAGES.UNDERSTANDING,
    });

    const result = ACTIVE_PRODUCTION_STAGES.has(state?.stage)
      ? await resumeExistingProduction(ref)
      : await CreativeDirectorRuntime.execute({
          ...input,
          ...ref,
        });
    const health = await inspectHealth(ref);
    const status = missionStatus({ result, state, health });

    if (status.status === "COMPLETED") {
      await CreativeStateEngine.complete(ref, {
        contract: CONTRACT,
        finalisation_passed: true,
        capability_only_execution: true,
        provider_selection_exposed: false,
        raw_reasoning_persisted: false,
      });
    } else if (status.human_decision_required) {
      await CreativeStateEngine.set(ref, PIPELINE_STAGES.WAITING_APPROVAL);
    } else if (status.next_action === "MONITOR_RUNNING_WORKERS") {
      await CreativeStateEngine.set(ref, PIPELINE_STAGES.MONITORING);
    } else if (status.next_action === "DIAGNOSE_AND_REPAIR") {
      await CreativeStateEngine.set(ref, PIPELINE_STAGES.REVIEWING);
    } else {
      await CreativeStateEngine.set(ref, PIPELINE_STAGES.PRODUCING);
    }

    return {
      success: result?.success !== false,
      organization_id: ref.organization_id,
      creative_mission_id: ref.creative_mission_id,
      creative_project_id: ref.creative_project_id,
      mission: status,
      internal_execution_result: {
        status: result?.status || null,
        workflow_kind: result?.workflow_kind || null,
        resumed_existing_production: result?.resumed_existing_production === true,
        planning_replayed: result?.planning_replayed === true,
      },
    };
  },

  async inspect(input = {}) {
    const ref = stateRef(input);
    const [state, health] = await Promise.all([
      CreativeStateEngine.get(ref),
      inspectHealth(ref),
    ]);
    return {
      contract: CONTRACT,
      organization_id: ref.organization_id,
      creative_mission_id: ref.creative_mission_id,
      creative_project_id: ref.creative_project_id,
      stage: state?.stage || null,
      health: {
        status: health.status,
        failed_count: Number(health.failed_count || 0),
        stuck_count: Number(health.stuck_count || 0),
        running_count: Number(health.running_count || 0),
      },
      provider_selection_exposed: false,
      raw_reasoning_persisted: false,
    };
  },
});

export default CreativePartnerMissionRuntime;
