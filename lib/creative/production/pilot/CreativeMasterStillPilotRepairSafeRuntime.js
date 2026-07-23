import {
  CreativeMasterStillPilotRuntime,
} from "@/lib/creative/production/pilot/CreativeMasterStillPilotRuntime";

import {
  CreativeMasterStillPilotRepairRuntime,
} from "@/lib/creative/production/pilot/CreativeMasterStillPilotRepairRuntime";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

import {
  deterministicUuid,
} from "@/lib/operations/tasks/identity/ProductionTaskIdentity";

function summarize(task = null) {
  if (!task) return null;

  return {
    id: task.id || null,
    status: task.status || null,
    error: task.error || null,
    asset_url:
      task.output?.image_url ||
      task.output?.url ||
      task.output?.asset?.image_url ||
      task.output?.asset?.url ||
      null,
    asset_id: task.output?.asset_id || null,
    provider_status: task.metadata?.provider_status || null,
    attempt: Number(task.metadata?.attempt || 0),
    cost: {
      currency: task.cost?.currency || null,
      actual: Number(task.cost?.actual || 0),
    },
  };
}

export const CreativeMasterStillPilotRepairSafeRuntime = {
  async run(input = {}) {
    try {
      return await CreativeMasterStillPilotRepairRuntime.run(input);
    } catch (error) {
      if (!/Cannot read properties of null \(reading 'output'\)/.test(
        String(error?.message || error || ""),
      )) {
        throw error;
      }

      const initial = await CreativeMasterStillPilotRuntime.run(input);
      const originalMasterId = initial.master_still?.id || null;
      const originalQaId = initial.quality_review?.id || null;

      if (!originalMasterId || !originalQaId) {
        throw error;
      }

      const repairMasterId = deterministicUuid(
        `AVANTIQO_MASTER_STILL_REPAIR_V1:${originalMasterId}`,
      );
      const repairQaId = deterministicUuid(
        `AVANTIQO_MASTER_STILL_REPAIR_QA_V1:${originalQaId}`,
      );
      const scope = {
        organization_id: input.organization_id,
        creative_project_id: input.creative_project_id,
      };
      const [repairMaster, repairQa] = await Promise.all([
        ProductionTaskRuntime.get(repairMasterId, scope),
        ProductionTaskRuntime.get(repairQaId, scope),
      ]);

      const master = summarize(repairMaster);
      const qa = summarize(repairQa);
      const masterComplete = ["COMPLETED", "APPROVED"].includes(
        master?.status,
      );

      return {
        ...initial,
        success: false,
        production_scope: "ONE_MASTER_STILL_REPAIR_AND_ITS_QA",
        master_still: master || {
          id: repairMasterId,
          status: "NOT_MATERIALIZED",
        },
        quality_review: qa || {
          id: repairQaId,
          status: masterComplete
            ? "READY_TO_MATERIALIZE"
            : "WAITING_FOR_REPAIRED_MASTER",
          passed: false,
          overall_score: 0,
          minimum_score: Number(
            initial.quality_review?.minimum_score || 90,
          ),
        },
        repair_attempt: {
          attempted: Boolean(repairMaster),
          attempt: 1,
          automatic_repairs_remaining: 0,
          response_recovered_from_null_qa_state: true,
        },
        video_tasks_materialized: 0,
        video_tasks_dispatched: 0,
        next_gate:
          repairMaster?.status === "FAILED"
            ? "MASTER_STILL_REPAIR_TECHNICAL_FAILURE"
            : masterComplete
              ? "MASTER_STILL_REPAIR_QA_PENDING"
              : "MASTER_STILL_REPAIR_PROCESSING",
      };
    }
  },
};
