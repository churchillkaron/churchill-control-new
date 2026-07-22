import {
  CreativeMasterStillPilotRuntime,
} from "@/lib/creative/production/pilot/CreativeMasterStillPilotRuntime";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

import {
  deterministicUuid,
} from "@/lib/operations/tasks/identity/ProductionTaskIdentity";

const SUCCESSFUL = new Set(["COMPLETED", "APPROVED"]);

function qaReview(task = {}) {
  return (
    task.output?.result?.json ||
    task.output?.result ||
    task.metadata?.quality_review ||
    task.metadata?.structured_failure?.quality_review ||
    null
  );
}

function masterAssetUrl(task = {}) {
  return (
    task.output?.image_url ||
    task.output?.url ||
    task.output?.asset?.url ||
    task.output?.asset?.image_url ||
    null
  );
}

function summarizeTask(task = {}) {
  return {
    id: task.id || null,
    execution_step_id: task.metadata?.execution_step_id || null,
    status: task.status || null,
    title: task.title || "",
    deliverable: task.metadata?.deliverable || null,
    provider: task.metadata?.provider || null,
    attempt: Number(task.metadata?.attempt || 0),
    error: task.error || null,
    cost: {
      currency: task.cost?.currency || null,
      estimated: Number(task.cost?.estimated || 0),
      actual: Number(task.cost?.actual || 0),
    },
  };
}

async function ensureTask(id, values, scope) {
  const existing = await ProductionTaskRuntime.get(id, scope);
  if (existing) return existing;
  return ProductionTaskRuntime.create({
    id,
    ...values,
  });
}

async function dispatchOnce(task = {}) {
  if (!task?.id) return task;
  if (SUCCESSFUL.has(task.status)) return task;
  if (["RUNNING", "REVIEW", "FAILED"].includes(task.status)) {
    return task;
  }
  return ProductionTaskRuntime.dispatch(task.id);
}

function uniqueCorrections(review = {}, qaTask = {}) {
  return [...new Set([
    ...(review?.correction_instructions || []),
    ...(qaTask.metadata?.correction_instructions || []),
  ].filter(Boolean))];
}

export const CreativeMasterStillPilotRepairRuntime = {
  async run(input = {}) {
    const initial = await CreativeMasterStillPilotRuntime.run(input);

    if (
      initial.success ||
      initial.next_gate !== "MASTER_STILL_REPAIR_REQUIRED" ||
      !initial.master_still?.id ||
      !initial.quality_review?.id
    ) {
      return initial;
    }

    const scope = {
      organization_id: input.organization_id,
      creative_project_id: input.creative_project_id,
    };
    const [originalMaster, originalQa] = await Promise.all([
      ProductionTaskRuntime.get(initial.master_still.id, scope),
      ProductionTaskRuntime.get(initial.quality_review.id, scope),
    ]);

    if (!originalMaster || !originalQa) {
      return initial;
    }

    const originalReview = qaReview(originalQa);
    const corrections = uniqueCorrections(originalReview, originalQa);

    if (!corrections.length) {
      return initial;
    }

    const repairMasterId = deterministicUuid(
      `AVANTIQO_MASTER_STILL_REPAIR_V1:${originalMaster.id}`,
    );
    const repairQaId = deterministicUuid(
      `AVANTIQO_MASTER_STILL_REPAIR_QA_V1:${originalQa.id}`,
    );
    const repairStepId =
      `${originalMaster.metadata?.execution_step_id || originalMaster.id}:repair:v1`;
    const repairQaStepId =
      `${originalQa.metadata?.execution_step_id || originalQa.id}:repair:v1`;

    let repairMaster = await ensureTask(
      repairMasterId,
      {
        organization_id: originalMaster.organization_id,
        creative_project_id: originalMaster.creative_project_id,
        production_graph_id: originalMaster.production_graph_id,
        scene_id: originalMaster.scene_id,
        shot_id: originalMaster.shot_id,
        type: originalMaster.type,
        status: "WAITING",
        title: `${originalMaster.title} — QA Repair 1`,
        description: originalMaster.description || "",
        service_id: originalMaster.service_id,
        service_code: originalMaster.service_code,
        capability: originalMaster.capability,
        priority: Number(originalMaster.priority || 100),
        depends_on: [originalMaster.id],
        input: {
          ...(originalMaster.input || {}),
          specification: {
            ...(originalMaster.input?.specification || {}),
            quality_corrections: corrections,
          },
          prompt: [
            originalMaster.input?.prompt || "",
            "Repair the rejected master still. Apply every mandatory QA correction while preserving all approved visual truth from the prior still and original references.",
          ].filter(Boolean).join("\n\n"),
        },
        cost: {
          ...(originalMaster.cost || {}),
          actual: 0,
          approved: true,
        },
        timing: {
          estimated_seconds: Number(
            originalMaster.timing?.estimated_seconds || 0,
          ),
          started_at: null,
          completed_at: null,
        },
        review: {
          required: true,
          approved: false,
          approved_by: null,
          notes: "",
        },
        metadata: {
          ...(originalMaster.metadata || {}),
          execution_step_id: repairStepId,
          idempotency_key: repairStepId,
          repair_attempt: 1,
          repair_of_task_id: originalMaster.id,
          rejected_qa_task_id: originalQa.id,
          correction_instructions: corrections,
          max_attempts: 1,
          pilot_scope: "SINGLE_MASTER_STILL_REPAIR_WITH_QA",
          video_execution_forbidden: true,
          provider_status: "PLANNED_REPAIR",
          attempt: 0,
        },
      },
      scope,
    );

    let repairQa = await ensureTask(
      repairQaId,
      {
        organization_id: originalQa.organization_id,
        creative_project_id: originalQa.creative_project_id,
        production_graph_id: originalQa.production_graph_id,
        scene_id: originalQa.scene_id,
        shot_id: originalQa.shot_id,
        type: originalQa.type,
        status: "WAITING",
        title: `${originalQa.title} — Repair QA 1`,
        description: originalQa.description || "",
        service_id: originalQa.service_id,
        service_code: originalQa.service_code,
        capability: originalQa.capability,
        priority: Number(originalQa.priority || 100),
        depends_on: [repairMasterId],
        input: {
          ...(originalQa.input || {}),
          repair_attempt: 1,
          correction_instructions: corrections,
          original_quality_review: originalReview,
        },
        cost: {
          ...(originalQa.cost || {}),
          actual: 0,
          approved: true,
        },
        timing: {
          estimated_seconds: Number(
            originalQa.timing?.estimated_seconds || 0,
          ),
          started_at: null,
          completed_at: null,
        },
        review: {
          required: true,
          approved: false,
          approved_by: null,
          notes: "",
        },
        metadata: {
          ...(originalQa.metadata || {}),
          execution_step_id: repairQaStepId,
          idempotency_key: repairQaStepId,
          repair_attempt: 1,
          repair_of_qa_task_id: originalQa.id,
          inspected_repair_task_id: repairMasterId,
          correction_instructions: corrections,
          max_attempts: 1,
          pilot_scope: "SINGLE_MASTER_STILL_REPAIR_WITH_QA",
          video_execution_forbidden: true,
          provider_status: "PLANNED_REPAIR_QA",
          attempt: 0,
        },
      },
      scope,
    );

    repairMaster = await dispatchOnce(repairMaster);

    if (SUCCESSFUL.has(repairMaster.status)) {
      repairQa = await dispatchOnce(repairQa);
    }

    const repairedReview = qaReview(repairQa);
    const repairedPassed =
      SUCCESSFUL.has(repairMaster.status) &&
      SUCCESSFUL.has(repairQa.status) &&
      repairedReview?.passed === true;

    return {
      ...initial,
      success: repairedPassed,
      production_scope: "ONE_MASTER_STILL_REPAIR_AND_ITS_QA",
      master_still: {
        ...summarizeTask(repairMaster),
        asset_url: masterAssetUrl(repairMaster),
        asset_id: repairMaster.output?.asset_id || null,
        repaired_from_task_id: originalMaster.id,
      },
      quality_review: {
        ...summarizeTask(repairQa),
        passed: repairedReview?.passed === true,
        overall_score: Number(repairedReview?.overall_score || 0),
        minimum_score: Number(
          repairQa.input?.minimum_score ||
          repairQa.input?.requirements?.minimum_score ||
          initial.quality_review?.minimum_score ||
          90,
        ),
        critical_failures: repairedReview?.critical_failures || [],
        issues: repairedReview?.issues || [],
        correction_instructions:
          repairedReview?.correction_instructions || [],
        repaired_from_qa_task_id: originalQa.id,
      },
      repair_attempt: {
        attempted: true,
        attempt: 1,
        correction_count: corrections.length,
        corrections,
        original_score: Number(originalReview?.overall_score || 0),
        repaired_score: Number(repairedReview?.overall_score || 0),
        automatic_repairs_remaining: 0,
      },
      video_tasks_materialized: 0,
      video_tasks_dispatched: 0,
      next_gate: repairedPassed
        ? "MASTER_STILL_PILOT_APPROVED"
        : repairQa.status === "FAILED"
          ? "MASTER_STILL_MANUAL_REVIEW_REQUIRED"
          : repairMaster.status === "RUNNING"
            ? "MASTER_STILL_REPAIR_PROCESSING"
            : "MASTER_STILL_REPAIR_INCOMPLETE",
    };
  },
};
