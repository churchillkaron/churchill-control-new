import {
  CreativeMasterStillPilotRuntime,
} from "@/lib/creative/production/pilot/CreativeMasterStillPilotRuntime";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

import {
  deterministicUuid,
} from "@/lib/operations/tasks/identity/ProductionTaskIdentity";

import {
  CreativeStorageRuntime,
} from "@/lib/creative/storage/runtime/CreativeStorageRuntime";

const SUCCESSFUL = new Set(["COMPLETED", "APPROVED"]);
const ACTIVE = new Set(["RUNNING", "REVIEW"]);

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

function assetReferenceFromTask(task = {}) {
  const url = masterAssetUrl(task);
  if (!url) return null;

  return {
    id: task.output?.asset_id || task.id,
    url,
    image_url: url,
    file_url: url,
    source_task_id: task.id,
    source_node_id: task.metadata?.node_id || null,
    reference_role: "REJECTED_MASTER_STILL_REPAIR_SOURCE",
  };
}

function dedupeReferences(values = []) {
  const seen = new Set();
  const result = [];

  for (const value of values || []) {
    if (!value) continue;

    const key = typeof value === "string"
      ? value
      : value.id || value.image_url || value.file_url || value.url;

    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }

  return result;
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

function uniqueCorrections(review = {}, qaTask = {}) {
  return [...new Set([
    ...(review?.correction_instructions || []),
    ...(qaTask.metadata?.correction_instructions || []),
  ].filter(Boolean))];
}

function isStatementTimeout(error) {
  return /statement timeout|canceling statement/i.test(
    String(error?.message || error || ""),
  );
}

function hasMediaOutput(task = {}) {
  return Boolean(masterAssetUrl(task));
}

async function ensureTask(id, values, scope) {
  const existing = await ProductionTaskRuntime.get(id, scope);
  if (existing) return existing;

  return ProductionTaskRuntime.create({
    id,
    ...values,
  });
}

async function currentTask(id, scope, fallback = null) {
  try {
    return await ProductionTaskRuntime.get(id, scope) || fallback;
  } catch {
    return fallback;
  }
}

async function recoverStoredMaster(task = {}, scope = {}) {
  if (
    !task?.id ||
    hasMediaOutput(task) ||
    !["RUNNING", "FAILED"].includes(task.status)
  ) {
    return task;
  }

  const stored = await CreativeStorageRuntime.findStoredAsset({
    organization_id: task.organization_id,
    creative_project_id: task.creative_project_id,
    asset_id: task.id,
  }).catch(() => null);

  if (!stored?.signed_url || !stored?.storage_path) {
    return task;
  }

  return ProductionTaskRuntime.update(
    task.id,
    {
      status: "COMPLETED",
      output: {
        ...(task.output || {}),
        url: stored.signed_url,
        image_url: stored.signed_url,
        storage_path: stored.storage_path,
        recovered_from_canonical_storage: true,
        asset_node_reconciliation_required: true,
      },
      timing: {
        ...(task.timing || {}),
        completed_at: new Date().toISOString(),
      },
      metadata: {
        ...(task.metadata || {}),
        provider_status: "COMPLETED_RECOVERED",
        recovered_from_canonical_storage: true,
        recovered_storage_path: stored.storage_path,
        recovered_at: new Date().toISOString(),
        asset_node_reconciliation_required: true,
      },
      worker_id: null,
      lease_expires_at: null,
      error: null,
    },
    scope,
  );
}

async function resumeTechnicalFailure(task = {}, scope = {}) {
  if (
    task.status !== "FAILED" ||
    !isStatementTimeout(task.error) ||
    Number(task.cost?.actual || 0) > 0 ||
    task.output?.provider_submission ||
    Number(task.metadata?.technical_resume_attempt || 0) >= 1
  ) {
    return task;
  }

  return ProductionTaskRuntime.update(
    task.id,
    {
      status: "WAITING",
      error: null,
      timing: {
        ...(task.timing || {}),
        started_at: null,
        completed_at: null,
      },
      metadata: {
        ...(task.metadata || {}),
        attempt: 0,
        provider_status: "TECHNICAL_RESUME_READY",
        technical_resume_attempt: 1,
        technical_resume_reason: "DATABASE_STATEMENT_TIMEOUT",
      },
      worker_id: null,
      lease_expires_at: null,
    },
    scope,
  );
}

async function dispatchSafely(task = {}, scope = {}) {
  if (!task?.id) {
    return { task, dispatch_error: null };
  }

  let current = await recoverStoredMaster(task, scope);
  current = await resumeTechnicalFailure(current, scope);

  if (
    SUCCESSFUL.has(current.status) ||
    ACTIVE.has(current.status) ||
    current.status === "FAILED"
  ) {
    return { task: current, dispatch_error: null };
  }

  try {
    return {
      task: await ProductionTaskRuntime.dispatch(current.id),
      dispatch_error: null,
    };
  } catch (error) {
    const latest = await currentTask(current.id, scope, current);
    return {
      task: latest,
      dispatch_error: error?.message || String(error),
    };
  }
}

function repairMasterValues({
  originalMaster,
  originalQa,
  corrections,
  repairStepId,
}) {
  const rejectedReference = assetReferenceFromTask(originalMaster);
  const originalReferences = [
    ...(originalMaster.input?.reference_assets || []),
    ...(originalMaster.input?.assets || []),
  ];

  return {
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
    depends_on: [],
    input: {
      ...(originalMaster.input || {}),
      reference_assets: dedupeReferences([
        rejectedReference,
        ...originalReferences,
      ]),
      assets: [],
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
      dependency_free_repair: true,
    },
  };
}

function repairQaValues({
  originalQa,
  repairMaster,
  corrections,
  originalReview,
  repairQaStepId,
}) {
  const repairedReference = assetReferenceFromTask(repairMaster);

  return {
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
    depends_on: [],
    input: {
      ...(originalQa.input || {}),
      assets: repairedReference ? [repairedReference] : [],
      reference_assets: repairedReference ? [repairedReference] : [],
      source_image: repairedReference?.image_url || null,
      inspected_task_id: repairMaster.id,
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
      inspected_repair_task_id: repairMaster.id,
      correction_instructions: corrections,
      max_attempts: 1,
      pilot_scope: "SINGLE_MASTER_STILL_REPAIR_WITH_QA",
      video_execution_forbidden: true,
      provider_status: "PLANNED_REPAIR_QA",
      attempt: 0,
      dependency_free_repair: true,
    },
  };
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
      repairMasterValues({
        originalMaster,
        originalQa,
        corrections,
        repairStepId,
      }),
      scope,
    );

    const masterDispatch = await dispatchSafely(repairMaster, scope);
    repairMaster = masterDispatch.task;

    let repairQa = await ProductionTaskRuntime.get(repairQaId, scope);
    let qaDispatchError = null;

    if (SUCCESSFUL.has(repairMaster.status)) {
      repairQa = await ensureTask(
        repairQaId,
        repairQaValues({
          originalQa,
          repairMaster,
          corrections,
          originalReview,
          repairQaStepId,
        }),
        scope,
      );

      const qaDispatch = await dispatchSafely(repairQa, scope);
      repairQa = qaDispatch.task;
      qaDispatchError = qaDispatch.dispatch_error;
    }

    const repairedReview = qaReview(repairQa);
    const repairedPassed =
      SUCCESSFUL.has(repairMaster.status) &&
      SUCCESSFUL.has(repairQa?.status) &&
      repairedReview?.passed === true;
    const technicalError =
      masterDispatch.dispatch_error ||
      qaDispatchError ||
      null;

    return {
      ...initial,
      success: repairedPassed,
      production_scope: "ONE_MASTER_STILL_REPAIR_AND_ITS_QA",
      master_still: {
        ...summarizeTask(repairMaster),
        asset_url: masterAssetUrl(repairMaster),
        asset_id: repairMaster.output?.asset_id || null,
        repaired_from_task_id: originalMaster.id,
        recovered_from_canonical_storage:
          repairMaster.output?.recovered_from_canonical_storage === true,
      },
      quality_review: repairQa
        ? {
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
          }
        : {
            id: repairQaId,
            status: "WAITING_FOR_REPAIRED_MASTER",
            passed: false,
            overall_score: 0,
            minimum_score: Number(
              initial.quality_review?.minimum_score || 90,
            ),
            critical_failures: [],
            issues: [],
            correction_instructions: [],
            error: null,
          },
      repair_attempt: {
        attempted: true,
        attempt: 1,
        correction_count: corrections.length,
        corrections,
        original_score: Number(originalReview?.overall_score || 0),
        repaired_score: Number(repairedReview?.overall_score || 0),
        automatic_repairs_remaining: 0,
        technical_error: technicalError,
      },
      video_tasks_materialized: 0,
      video_tasks_dispatched: 0,
      next_gate: repairedPassed
        ? "MASTER_STILL_PILOT_APPROVED"
        : repairQa?.status === "FAILED"
          ? "MASTER_STILL_MANUAL_REVIEW_REQUIRED"
          : repairMaster.status === "FAILED"
            ? "MASTER_STILL_REPAIR_TECHNICAL_FAILURE"
            : ACTIVE.has(repairMaster.status)
              ? "MASTER_STILL_REPAIR_PROCESSING"
              : repairQa && ACTIVE.has(repairQa.status)
                ? "MASTER_STILL_REPAIR_QA_PROCESSING"
                : technicalError
                  ? "MASTER_STILL_REPAIR_DATABASE_RETRY"
                  : "MASTER_STILL_REPAIR_INCOMPLETE",
    };
  },
};
