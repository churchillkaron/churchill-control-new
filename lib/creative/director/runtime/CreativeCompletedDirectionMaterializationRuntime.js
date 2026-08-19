import crypto from "node:crypto";

import {
  CreativeExecutionJobRepository,
} from "@/lib/creative/execution/repositories/CreativeExecutionJobRepository";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import {
  DIRECTION_JOB_CONTRACT,
} from "@/lib/creative/director/runtime/CreativeProjectDirectionRuntime";
import {
  buildCreativePipeline,
} from "@/lib/creative/director/orchestrator/CreativePipelineOrchestrator";
import * as ProductionGraphRepository
from "@/lib/creative/production-graph/repositories/ProductionGraphRepository";
import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const CONTRACT = "CREATIVE_COMPLETED_DIRECTION_MATERIALIZATION_V2";
const MATERIALIZATION_JOB_TYPE = "PROJECT_DIRECTION_MATERIALIZATION";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function exactNumber(left, right) {
  return Math.abs(Number(left || 0) - Number(right || 0)) <= 0.001;
}

function projectDuration(project = {}) {
  return finite(
    project.target_duration ??
    project.metadata?.temporal_contract?.duration_seconds,
  );
}

function planDuration(plan = {}) {
  const scenes = Array.isArray(plan.scenes) ? plan.scenes : [];
  return scenes.reduce(
    (sum, scene) => sum + Number(scene?.duration_seconds || 0),
    0,
  );
}

function assertJobLineage(job = {}, result = {}) {
  const payload = object(job.payload);
  const expectedHash = text(payload.direction_hash);
  const actualHash = text(result.direction_hash);
  if (!expectedHash || !actualHash) {
    throw new Error("CREATIVE_DIRECTION_RESULT_HASH_REQUIRED");
  }
  if (expectedHash !== actualHash) {
    throw new Error("CREATIVE_DIRECTION_RESULT_HASH_MISMATCH");
  }

  const expectedApprovalId = text(payload.direction_approval_id);
  const actualApprovalId = text(result.direction_approval_id);
  if (
    expectedApprovalId &&
    (!actualApprovalId || expectedApprovalId !== actualApprovalId)
  ) {
    throw new Error("CREATIVE_DIRECTION_RESULT_APPROVAL_MISMATCH");
  }

  const expectedResearchId = text(payload.research_report_id);
  const actualResearchId = text(result.research_report_id);
  if (
    expectedResearchId &&
    (!actualResearchId || expectedResearchId !== actualResearchId)
  ) {
    throw new Error("CREATIVE_DIRECTION_RESULT_RESEARCH_MISMATCH");
  }
}

function assertCompletedDirectionJob(job = {}, context = {}) {
  if (!job?.id) throw new Error("CREATIVE_DIRECTION_JOB_NOT_FOUND");
  if (text(job.organization_id) !== text(context.organization_id)) {
    throw new Error("CREATIVE_DIRECTION_JOB_ORGANIZATION_MISMATCH");
  }
  if (text(job.creative_project_id) !== text(context.creative_project_id)) {
    throw new Error("CREATIVE_DIRECTION_JOB_PROJECT_MISMATCH");
  }
  if (text(job.job_type).toUpperCase() !== "PROJECT_DIRECTION") {
    throw new Error("CREATIVE_DIRECTION_JOB_TYPE_INVALID");
  }
  if (text(job.status).toUpperCase() !== "COMPLETED") {
    throw new Error("CREATIVE_DIRECTION_JOB_NOT_COMPLETED");
  }

  const result = object(job.result);
  if (text(result.contract) !== DIRECTION_JOB_CONTRACT) {
    throw new Error("CREATIVE_DIRECTION_RESULT_CONTRACT_INVALID");
  }
  if (!Object.keys(object(result.plan)).length) {
    throw new Error("CREATIVE_DIRECTION_RESULT_PLAN_REQUIRED");
  }
  if (result.plan?.validation?.passed !== true) {
    throw new Error("CREATIVE_DIRECTION_RESULT_VALIDATION_REQUIRED");
  }
  if (result.production_started === true) {
    throw new Error("CREATIVE_DIRECTION_RESULT_ALREADY_STARTED_PRODUCTION");
  }
  if (result.media_generation_authorized === true) {
    throw new Error("CREATIVE_DIRECTION_RESULT_MEDIA_AUTHORIZATION_INVALID");
  }
  if (result.publication_authorized === true) {
    throw new Error("CREATIVE_DIRECTION_RESULT_PUBLICATION_AUTHORIZATION_INVALID");
  }

  assertJobLineage(job, result);
  return result;
}

function assertDuration(project = {}, result = {}) {
  const expected = projectDuration(project);
  const resultDuration = finite(result.target_duration_seconds);
  const actual = planDuration(result.plan);

  if (expected !== null && !exactNumber(actual, expected)) {
    throw new Error("CREATIVE_DIRECTION_PROJECT_DURATION_MISMATCH");
  }
  if (resultDuration !== null && !exactNumber(actual, resultDuration)) {
    throw new Error("CREATIVE_DIRECTION_RESULT_DURATION_MISMATCH");
  }
}

async function assertProjectUnmaterialized({
  organization_id,
  creative_project_id,
}) {
  const [graphs, tasks] = await Promise.all([
    ProductionGraphRepository.listByProject({
      organization_id,
      creative_project_id,
    }),
    ProductionTaskRuntime.list({
      organization_id,
      creative_project_id,
    }),
  ]);

  if (graphs.length || tasks.length) {
    throw new Error(
      `CREATIVE_PROJECT_ALREADY_MATERIALIZED:${graphs.length}:${tasks.length}`,
    );
  }
}

function materializationIdentity({ projectId, directionJobId, directionHash }) {
  return [
    "creative-project-direction-materialization-v2",
    projectId,
    directionJobId,
    directionHash,
  ].join(":");
}

async function reserveMaterialization({
  organization_id,
  creative_project_id,
  creative_mission_id,
  directionJob,
  directionResult,
}) {
  const leaseToken = crypto.randomUUID();
  const workerId = `creative-materialization-${crypto.randomUUID()}`;
  const { job, created } = await CreativeExecutionJobRepository.enqueue({
    organization_id,
    creative_project_id,
    job_type: MATERIALIZATION_JOB_TYPE,
    idempotency_key: materializationIdentity({
      projectId: creative_project_id,
      directionJobId: directionJob.id,
      directionHash: directionResult.direction_hash,
    }),
    status: "RUNNING",
    priority: 40,
    attempt_count: 1,
    maximum_attempts: 1,
    lease_token: leaseToken,
    lease_owner: workerId,
    started_at: new Date().toISOString(),
    payload: {
      contract: CONTRACT,
      creative_mission_id,
      direction_job_id: directionJob.id,
      direction_hash: directionResult.direction_hash,
      research_report_id: directionResult.research_report_id || null,
      direction_approval_id: directionResult.direction_approval_id || null,
      media_generation_authorized: false,
      publication_authorized: false,
    },
    progress: {
      stage: "MATERIALIZING_COMPLETED_DIRECTION",
      direction_job_id: directionJob.id,
      direction_hash: directionResult.direction_hash,
      production_started: true,
      provider_execution_started: false,
      media_generation_authorized: false,
      publication_authorized: false,
    },
  });

  if (!created) {
    throw new Error(
      `CREATIVE_PROJECT_MATERIALIZATION_ALREADY_RESERVED:${text(job?.status) || "UNKNOWN"}`,
    );
  }

  return { job, leaseToken };
}

function materializationResult({
  pipeline = {},
  directionJob,
  directionResult,
  creativeMissionId,
  creativeProjectId,
}) {
  const taskIds = list(pipeline.tasks?.all).map((task) => task.id).filter(Boolean);
  return {
    contract: CONTRACT,
    direction_job_id: directionJob.id,
    direction_hash: directionResult.direction_hash,
    creative_mission_id: creativeMissionId,
    creative_project_id: creativeProjectId,
    production_graph_id:
      pipeline.optimizedGraph?.id || pipeline.graph?.id || null,
    production_task_ids: taskIds,
    production_task_count: taskIds.length,
    direction_rerun_performed: false,
    provider_execution_started: false,
    media_generation_authorized: false,
    publication_authorized: false,
  };
}

export async function materializeCompletedProjectDirection({
  organization_id,
  creative_project_id,
  direction_job_id,
} = {}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");
  if (!direction_job_id) throw new Error("direction_job_id required");

  const [project, directionJob] = await Promise.all([
    CreativeProjectRuntime.get(creative_project_id),
    CreativeExecutionJobRepository.getById(direction_job_id),
  ]);

  if (!project || text(project.organization_id) !== text(organization_id)) {
    throw new Error("CREATIVE_PROJECT_NOT_FOUND");
  }

  const directionResult = assertCompletedDirectionJob(directionJob, {
    organization_id,
    creative_project_id,
  });
  assertDuration(project, directionResult);

  const creativeMissionId = text(
    directionJob.payload?.creative_mission_id || project.creative_mission_id,
  );
  if (!creativeMissionId) {
    throw new Error("creative_mission_id required");
  }

  await assertProjectUnmaterialized({
    organization_id,
    creative_project_id,
  });

  const reservation = await reserveMaterialization({
    organization_id,
    creative_project_id,
    creative_mission_id: creativeMissionId,
    directionJob,
    directionResult,
  });

  try {
    const pipeline = await buildCreativePipeline({
      organization_id,
      creative_mission_id: creativeMissionId,
      creative_project_id,
      master: directionResult,
    });
    const result = materializationResult({
      pipeline,
      directionJob,
      directionResult,
      creativeMissionId,
      creativeProjectId: creative_project_id,
    });

    await CreativeExecutionJobRepository.complete({
      job_id: reservation.job.id,
      lease_token: reservation.leaseToken,
      result,
      progress: {
        stage: "COMPLETED",
        production_materialized: true,
        production_graph_id: result.production_graph_id,
        production_task_count: result.production_task_count,
        provider_execution_started: false,
        media_generation_authorized: false,
        publication_authorized: false,
        completed_at: new Date().toISOString(),
      },
    });

    return {
      ...result,
      materialized: true,
      materialization_job_id: reservation.job.id,
      pipeline,
    };
  } catch (error) {
    try {
      await CreativeExecutionJobRepository.retry({
        job_id: reservation.job.id,
        lease_token: reservation.leaseToken,
        error: {
          message: error?.message || String(error),
          name: error?.name || "Error",
          permanent: true,
        },
        progress: {
          stage: "FAILED",
          production_materialized: false,
          provider_execution_started: false,
          media_generation_authorized: false,
          publication_authorized: false,
          failed_at: new Date().toISOString(),
        },
        delay_seconds: 0,
      });
    } catch {
      // Preserve the original materialization failure. The reservation remains fail-closed.
    }
    throw error;
  }
}

export const CreativeCompletedDirectionMaterializationRuntime = Object.freeze({
  contract: CONTRACT,
  job_type: MATERIALIZATION_JOB_TYPE,
  materialize: materializeCompletedProjectDirection,
});
