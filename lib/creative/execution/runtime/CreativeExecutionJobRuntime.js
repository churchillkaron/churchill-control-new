import crypto from "node:crypto";

import {
  CreativeExecutionJobRepository,
} from "@/lib/creative/execution/repositories/CreativeExecutionJobRepository";
import {
  CreativeCheckpointedShortlistVerificationRuntime,
} from "@/lib/creative/media/runtime/CreativeCheckpointedShortlistVerificationRuntime";

const JOB_TYPES = {
  SHORTLIST_VERIFY: "SHORTLIST_VERIFY",
};

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function errorPayload(error) {
  return {
    message: error?.message || String(error),
    name: error?.name || "Error",
    code: error?.code || null,
    cause: error?.cause?.message || null,
    validation: error?.validation || error?.cause?.validation || null,
    recorded_at: new Date().toISOString(),
  };
}

function retryDelay(attemptCount) {
  const attempt = Math.max(1, Number(attemptCount || 1));
  return Math.min(15 * 60, 15 * (2 ** Math.min(attempt - 1, 6)));
}

function permanentFailure(error) {
  const message = text(error?.message).toUpperCase();
  return [
    "AUTHORIZATION_MISMATCH",
    "CALL_BUDGET_EXCEEDED",
    "COST_ESTIMATE_NOT_READY",
    "PROJECT_SHORTLIST_REPORT_REQUIRED",
    "PROJECT_SHORTLIST_SELECTION_REQUIRED",
    "PROJECT_NOT_FOUND",
    "ORGANIZATION_ID REQUIRED",
    "CREATIVE_PROJECT_ID REQUIRED",
    "INPUT_MISMATCH",
  ].some((marker) => message.includes(marker));
}

async function executeJob(job, controls) {
  const payload = object(job.payload);

  switch (job.job_type) {
    case JOB_TYPES.SHORTLIST_VERIFY:
      await controls.heartbeat({
        stage: "VERIFYING_SHORTLIST",
        message: "Inspecting selected source moments one durable frame at a time",
      });
      return CreativeCheckpointedShortlistVerificationRuntime.verifyProject({
        organization_id: job.organization_id,
        creative_project_id: job.creative_project_id,
        authorization: object(payload.authorization),
        policy: object(payload.policy),
        country: payload.country || null,
        currency: payload.currency || null,
      });

    default:
      throw new Error(`CREATIVE_EXECUTION_JOB_TYPE_UNSUPPORTED:${job.job_type}`);
  }
}

export const CreativeExecutionJobRuntime = {
  JOB_TYPES,

  async enqueueShortlistVerification({
    organization_id,
    creative_project_id,
    project_shortlist_identity,
    authorization = {},
    policy = {},
    country = null,
    currency = null,
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");
    if (!project_shortlist_identity) {
      throw new Error("project_shortlist_identity required");
    }

    const idempotencyKey = [
      "creative-shortlist-verify-v2",
      creative_project_id,
      project_shortlist_identity,
    ].join(":");

    const { job, created } = await CreativeExecutionJobRepository.enqueue({
      organization_id,
      creative_project_id,
      job_type: JOB_TYPES.SHORTLIST_VERIFY,
      idempotency_key: idempotencyKey,
      priority: 50,
      maximum_attempts: 20,
      payload: {
        project_shortlist_identity,
        authorization: {
          ...object(authorization),
          project_shortlist_identity,
        },
        policy: object(policy),
        country,
        currency,
        production_authorized: false,
      },
      progress: {
        stage: "QUEUED",
        message: "Waiting for Creative execution worker",
        verification_runtime:
          "creative-checkpointed-shortlist-verification-v1",
        production_started: false,
      },
    });

    return {
      job,
      created,
      production_started: false,
    };
  },

  async processOne({
    worker_id = `creative-worker-${crypto.randomUUID()}`,
    lease_seconds = 900,
  } = {}) {
    const job = await CreativeExecutionJobRepository.claim({
      worker_id,
      job_types: Object.values(JOB_TYPES),
      lease_seconds,
    });

    if (!job) {
      return {
        claimed: false,
        worker_id,
        production_started: false,
      };
    }

    const controls = {
      heartbeat: (progress = {}) => CreativeExecutionJobRepository.heartbeat({
        job_id: job.id,
        lease_token: job.lease_token,
        lease_seconds,
        progress: {
          ...progress,
          attempt_count: job.attempt_count,
          worker_id,
          verification_runtime:
            "creative-checkpointed-shortlist-verification-v1",
          production_started: false,
          heartbeat_at: new Date().toISOString(),
        },
      }),
    };

    try {
      const result = await executeJob(job, controls);
      const completed = await CreativeExecutionJobRepository.complete({
        job_id: job.id,
        lease_token: job.lease_token,
        result: {
          ...object(result),
          production_started: false,
        },
        progress: {
          stage: "COMPLETED",
          message: "Creative verification completed",
          verification_runtime:
            "creative-checkpointed-shortlist-verification-v1",
          production_started: false,
          completed_at: new Date().toISOString(),
        },
      });

      return {
        claimed: true,
        completed: true,
        job: completed,
        production_started: false,
      };
    } catch (error) {
      const failure = errorPayload(error);
      const isPermanent = permanentFailure(error);
      const delaySeconds = isPermanent ? 0 : retryDelay(job.attempt_count);

      const updated = await CreativeExecutionJobRepository.retry({
        job_id: job.id,
        lease_token: job.lease_token,
        error: {
          ...failure,
          permanent: isPermanent,
        },
        progress: {
          stage: isPermanent ? "FAILED" : "RETRY_SCHEDULED",
          message: failure.message,
          verification_runtime:
            "creative-checkpointed-shortlist-verification-v1",
          production_started: false,
          failed_at: new Date().toISOString(),
        },
        delay_seconds: delaySeconds,
      });

      return {
        claimed: true,
        completed: false,
        retry_scheduled: updated?.status === "RETRY",
        permanent_failure: isPermanent,
        job: updated,
        error: failure,
        production_started: false,
      };
    }
  },

  async status({ organization_id, creative_project_id } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!creative_project_id) throw new Error("creative_project_id required");

    const jobs = await CreativeExecutionJobRepository.listByProject({
      organization_id,
      creative_project_id,
    });

    return {
      jobs,
      active_job_count: jobs.filter((job) =>
        ["QUEUED", "RUNNING", "RETRY"].includes(job.status),
      ).length,
      completed_job_count: jobs.filter((job) =>
        job.status === "COMPLETED",
      ).length,
      failed_job_count: jobs.filter((job) =>
        job.status === "FAILED",
      ).length,
      production_started: false,
    };
  },
};
