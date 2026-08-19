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

const CONTRACT = "CREATIVE_COMPLETED_DIRECTION_MATERIALIZATION_V1";

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
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

export async function materializeCompletedProjectDirection({
  organization_id,
  creative_project_id,
  direction_job_id,
} = {}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");
  if (!direction_job_id) throw new Error("direction_job_id required");

  const [project, job] = await Promise.all([
    CreativeProjectRuntime.get(creative_project_id),
    CreativeExecutionJobRepository.getById(direction_job_id),
  ]);

  if (!project || text(project.organization_id) !== text(organization_id)) {
    throw new Error("CREATIVE_PROJECT_NOT_FOUND");
  }

  const result = assertCompletedDirectionJob(job, {
    organization_id,
    creative_project_id,
  });
  assertDuration(project, result);

  const creativeMissionId = text(
    job.payload?.creative_mission_id || project.creative_mission_id,
  );
  if (!creativeMissionId) {
    throw new Error("creative_mission_id required");
  }

  const pipeline = await buildCreativePipeline({
    organization_id,
    creative_mission_id: creativeMissionId,
    creative_project_id,
    master: result,
  });

  return {
    contract: CONTRACT,
    materialized: true,
    direction_job_id: job.id,
    direction_hash: result.direction_hash,
    creative_mission_id: creativeMissionId,
    creative_project_id,
    pipeline,
    direction_rerun_performed: false,
    media_generation_authorized: false,
    provider_execution_started: false,
    publication_authorized: false,
  };
}

export const CreativeCompletedDirectionMaterializationRuntime = Object.freeze({
  contract: CONTRACT,
  materialize: materializeCompletedProjectDirection,
});
