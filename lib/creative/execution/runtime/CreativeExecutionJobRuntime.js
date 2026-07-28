import crypto from "node:crypto";

import {
  CreativeExecutionJobRepository,
} from "@/lib/creative/execution/repositories/CreativeExecutionJobRepository";
import {
  CreativeCheckpointedShortlistVerificationRuntime,
} from "@/lib/creative/media/runtime/CreativeCheckpointedShortlistVerificationRuntime";
import {
  CreativeDenseSemanticPlanRuntime,
  DENSE_SEMANTIC_RUNTIME_VERSION,
} from "@/lib/creative/media/runtime/CreativeDenseSemanticPlanRuntime";
import {
  CreativeExecutionContextRuntime,
} from "@/lib/creative/execution/runtime/CreativeExecutionContextRuntime";

const JOB_TYPES = Object.freeze({
  SHORTLIST_VERIFY: "SHORTLIST_VERIFY",
});
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
    "PRICING_NOT_READY",
    "COST_ESTIMATE_NOT_READY",
    "PROJECT_SHORTLIST_REPORT_REQUIRED",
    "PROJECT_SHORTLIST_SELECTION_REQUIRED",
    "PROJECT_NOT_FOUND",
    "CANDIDATE_PLAN_INVALID",
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
  if (job.job_type !== JOB_TYPES.SHORTLIST_VERIFY) {
    throw new Error(`CREATIVE_EXECUTION_JOB_TYPE_UNSUPPORTED:${job.job_type}`);
  }

  await controls.heartbeat({
    stage: "VERIFYING_DENSE_SEMANTIC_FRAMES",
    message:
      "Inspecting every authorised exact range with durable dense frame checkpoints",
    dense_semantic_plan_identity:
      payload.dense_semantic_plan_identity || null,
  });
  const verification =
    await CreativeCheckpointedShortlistVerificationRuntime.verifyProject({
      organization_id: job.organization_id,
      creative_project_id: job.creative_project_id,
      authorization: object(payload.authorization),
      policy: object(payload.policy),
      country: payload.country || null,
      currency: payload.currency || null,
    });

  return {
    ...verification,
    production_started: false,
  };
}

export const CreativeExecutionJobRuntime = {
  JOB_TYPES,

  async preflightShortlistVerification({
    organization_id,
    creative_project_id,
    policy = {},
    country = null,
    currency = null,
  } = {}) {
    return CreativeDenseSemanticPlanRuntime.preflight({
      organization_id,
      creative_project_id,
      policy,
      country,
      currency,
    });
  },

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

    const preflight = await this.preflightShortlistVerification({
      organization_id,
      creative_project_id,
      policy,
      country,
      currency,
    });
    if (!preflight.ready) {
      const error = new Error(
        `DENSE_SEMANTIC_PREFLIGHT_FAILED:${preflight.reasons.join(",")}`,
      );
      error.validation = preflight;
      throw error;
    }
    if (
      text(project_shortlist_identity) !==
      text(preflight.project_shortlist_identity)
    ) {
      const error = new Error("PROJECT_SHORTLIST_IDENTITY_MISMATCH");
      error.validation = preflight;
      throw error;
    }
    CreativeDenseSemanticPlanRuntime.assertAuthorization({
      authorization,
      preflight,
    });

    const idempotencyKey = [
      "creative-dense-shortlist-verify-v3",
      creative_project_id,
      preflight.dense_semantic_plan_identity,
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
        dense_semantic_plan_identity:
          preflight.dense_semantic_plan_identity,
        authorization: {
          ...object(authorization),
          project_shortlist_identity,
          dense_semantic_plan_identity:
            preflight.dense_semantic_plan_identity,
        },
        policy: object(policy),
        country,
        currency,
        preflight,
        production_authorized: false,
      },
      progress: {
        stage: "QUEUED",
        message: "Waiting for dense semantic verification worker",
        verification_runtime: DENSE_SEMANTIC_RUNTIME_VERSION,
        dense_semantic_plan_identity:
          preflight.dense_semantic_plan_identity,
        estimated_ai_calls: preflight.estimated_ai_calls,
        production_started: false,
      },
    });

    return {
      job,
      created,
      preflight,
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
      8,
      finite(
        maximum_new_provider_steps ??
        process.env.CREATIVE_EXECUTION_PROVIDER_STEPS_PER_BATCH,
        3,
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
          verification_runtime: DENSE_SEMANTIC_RUNTIME_VERSION,
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
          message: "Dense semantic verification completed",
          batch_provider_steps_completed: context.new_provider_steps,
          verification_runtime: DENSE_SEMANTIC_RUNTIME_VERSION,
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
              ? "Another worker owns the active dense frame"
              : "Dense frame batch checkpointed; continuing next cycle",
            batch_provider_steps_completed: context.new_provider_steps,
            batch_provider_step_limit: batchLimit,
            verification_runtime: DENSE_SEMANTIC_RUNTIME_VERSION,
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
          verification_runtime: DENSE_SEMANTIC_RUNTIME_VERSION,
          production_started: false,
          failed_at: new Date().toISOString(),
        },
        delay_seconds: isPermanent ? 0 : retryDelay(job.attempt_count),
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
      verification_runtime: DENSE_SEMANTIC_RUNTIME_VERSION,
      production_started: false,
    };
  },
};
