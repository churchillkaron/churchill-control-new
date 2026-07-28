import crypto from "node:crypto";

import {
  CreativeExecutionJobRepository,
} from "@/lib/creative/execution/repositories/CreativeExecutionJobRepository";
import {
  CreativeCheckpointedShortlistVerificationRuntime,
} from "@/lib/creative/media/runtime/CreativeCheckpointedShortlistVerificationRuntime";
import {
  CreativeLegacyVerificationRecoveryRuntime,
} from "@/lib/creative/execution/runtime/CreativeLegacyVerificationRecoveryRuntime";
import {
  CreativeExecutionContextRuntime,
} from "@/lib/creative/execution/runtime/CreativeExecutionContextRuntime";

const JOB_TYPES = {
  SHORTLIST_VERIFY: "SHORTLIST_VERIFY",
};

const CONTROLLED_YIELD_CODES = new Set([
  "CREATIVE_EXECUTION_BATCH_LIMIT_REACHED",
  "CREATIVE_EXECUTION_STEP_BUSY",
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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

function controlledYield(error) {
  return CONTROLLED_YIELD_CODES.has(error?.code) ||
    CONTROLLED_YIELD_CODES.has(error?.message);
}

async function executeJob(job, controls) {
  const payload = object(job.payload);

  switch (job.job_type) {
    case JOB_TYPES.SHORTLIST_VERIFY: {
      await controls.heartbeat({
        stage: "RECONCILING_PRIOR_VERIFICATION",
        message: "Importing prior paid-call evidence before any new provider work",
      });
      const recovery = await CreativeLegacyVerificationRecoveryRuntime.reconcile({
        job,
        project_shortlist_identity: payload.project_shortlist_identity,
        sample_fractions: Array.isArray(payload.policy?.sample_fractions)
          ? payload.policy.sample_fractions
          : [0.35, 0.7],
      });

      await controls.heartbeat({
        stage: "VERIFYING_SHORTLIST",
        message: "Inspecting selected source moments one durable frame at a time",
        imported_legacy_step_count: recovery.imported_step_count,
      });
      const verification = await CreativeCheckpointedShortlistVerificationRuntime.verifyProject({
        organization_id: job.organization_id,
        creative_project_id: job.creative_project_id,
        authorization: object(payload.authorization),
        policy: object(payload.policy),
        country: payload.country || null,
        currency: payload.currency || null,
      });

      return {
        ...verification,
        recovery,
        production_started: false,
      };
    }

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
      maximum_attempts: 100,
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
    maximum_new_provider_steps = null,
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

    const batchLimit = Math.max(1, Math.min(
      4,
      finite(
        maximum_new_provider_steps ??
        process.env.CREATIVE_EXECUTION_PROVIDER_STEPS_PER_BATCH,
        2,
      ),
    ));
    const controls = {
      heartbeat: (progress = {}) => CreativeExecutionJobRepository.heartbeat({
        job_id: job.id,
        lease_token: job.lease_token,
        lease_seconds,
        progress: {
          ...progress,
          attempt_count: job.attempt_count,
          worker_id,
          batch_provider_step_limit: batchLimit,
          verification_runtime:
            "creative-checkpointed-shortlist-verification-v1",
          production_started: false,
          heartbeat_at: new Date().toISOString(),
        },
      }),
    };
    const context = {
      job_id: job.id,
      job_lease_token: job.lease_token,
      heartbeat: controls.heartbeat,
      maximum_new_provider_steps: batchLimit,
      new_provider_steps: 0,
    };

    try {
      const result = await CreativeExecutionContextRuntime.run(
        context,
        () => executeJob(job, controls),
      );
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
          batch_provider_steps_completed: context.new_provider_steps,
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
      if (controlledYield(error)) {
        const busy = error?.code === "CREATIVE_EXECUTION_STEP_BUSY" ||
          error?.message === "CREATIVE_EXECUTION_STEP_BUSY";
        const yielded = await CreativeExecutionJobRepository.yield({
          job_id: job.id,
          lease_token: job.lease_token,
          delay_seconds: busy ? 15 : 0,
          progress: {
            stage: busy ? "WAITING_FOR_ACTIVE_FRAME" : "BATCH_CHECKPOINTED",
            message: busy
              ? "Another worker owns the active frame; waiting for its lease"
              : "Paid frame batch checkpointed; continuing on the next worker cycle",
            batch_provider_steps_completed: context.new_provider_steps,
            batch_provider_step_limit: batchLimit,
            verification_runtime:
              "creative-checkpointed-shortlist-verification-v1",
            production_started: false,
            yielded_at: new Date().toISOString(),
          },
        });

        return {
          claimed: true,
          completed: false,
          yielded: true,
          yield_reason: error?.code || error?.message,
          job: yielded,
          production_started: false,
        };
      }

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
          batch_provider_steps_completed: context.new_provider_steps,
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
