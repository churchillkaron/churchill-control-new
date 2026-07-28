#!/usr/bin/env node

import crypto from "node:crypto";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

function text(value) {
  return String(value ?? "").trim();
}

function required(name) {
  const value = text(process.env[name]);
  if (!value) throw new Error(`${name} required`);
  return value;
}

function finite(name) {
  const value = Number(required(name));
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return value;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const organizationId = required("CREATIVE_SMOKE_ORGANIZATION_ID");
const projectId = required("COLE_LEY_PROJECT_ID");
const projectShortlistIdentity = required("COLE_LEY_PROJECT_SHORTLIST_IDENTITY");
const densePlanIdentity = required("COLE_LEY_DENSE_PLAN_IDENTITY");
const maximumAiCalls = finite("COLE_LEY_MAXIMUM_AI_CALLS");
const maximumCustomerPrice = finite("COLE_LEY_MAXIMUM_CUSTOMER_PRICE");
const currency = required("COLE_LEY_CURRENCY").toUpperCase();
const maximumGap = Number(
  process.env.CREATIVE_DENSE_SAMPLE_GAP_SECONDS || 1.5,
);
const batchSize = Math.max(1, Math.min(
  8,
  Number(process.env.CREATIVE_EXECUTION_PROVIDER_STEPS_PER_BATCH || 3),
));

const {
  CreativeDenseSemanticExecutionPlanRuntime,
} = await import(
  "@/lib/creative/media/runtime/CreativeDenseSemanticExecutionPlanRuntime"
);
const {
  CreativeDenseSemanticRecoveryRuntime,
} = await import(
  "@/lib/creative/media/runtime/CreativeDenseSemanticRecoveryRuntime"
);
const {
  CreativeExecutionJobRepository,
} = await import(
  "@/lib/creative/execution/repositories/CreativeExecutionJobRepository"
);
const {
  CreativeExecutionContextRuntime,
} = await import(
  "@/lib/creative/execution/runtime/CreativeExecutionContextRuntime"
);
const { supabaseAdmin } = await import(
  "@/lib/shared/supabase/admin"
);

const policy = {
  maximum_semantic_sample_gap_seconds: maximumGap,
  minimum_verified_frame_quality_score: Number(
    process.env.CREATIVE_DENSE_MINIMUM_QUALITY_SCORE || 55,
  ),
  require_human_approval: true,
};
const country = process.env.CREATIVE_SMOKE_COUNTRY || "TH";
const authorization = {
  approved: true,
  project_shortlist_identity: projectShortlistIdentity,
  dense_semantic_plan_identity: densePlanIdentity,
  maximum_ai_calls: maximumAiCalls,
  maximum_customer_price: maximumCustomerPrice,
  currency,
};

const preflight = await CreativeDenseSemanticExecutionPlanRuntime.preflight({
  organization_id: organizationId,
  creative_project_id: projectId,
  policy,
  country,
  currency,
});
const mismatches = [];
if (preflight.ready !== true) mismatches.push("PREFLIGHT_NOT_READY");
if (text(preflight.project_shortlist_identity) !== projectShortlistIdentity) {
  mismatches.push("PROJECT_SHORTLIST_IDENTITY_MISMATCH");
}
if (text(preflight.dense_semantic_plan_identity) !== densePlanIdentity) {
  mismatches.push("DENSE_PLAN_IDENTITY_MISMATCH");
}
if (Number(preflight.total_planned_ai_calls) > maximumAiCalls) {
  mismatches.push("TOTAL_AI_CALL_LIMIT_EXCEEDED");
}
if (
  Number(preflight.total_estimated_customer_price || 0) >
  maximumCustomerPrice + 0.000001
) {
  mismatches.push("TOTAL_CUSTOMER_PRICE_LIMIT_EXCEEDED");
}
if (text(preflight.cost_estimate?.currency).toUpperCase() !== currency) {
  mismatches.push("CURRENCY_MISMATCH");
}
if (mismatches.length) {
  const error = new Error(
    `DENSE_RECOVERY_AUTHORIZATION_BLOCKED:${mismatches.join(",")}`,
  );
  error.preflight = preflight;
  throw error;
}

console.log("============================================================");
console.log("COLE DENSE SEMANTIC RECOVERY AUTHORIZATION");
console.log("============================================================");
console.log(`ORGANIZATION_ID=${organizationId}`);
console.log(`CREATIVE_PROJECT_ID=${projectId}`);
console.log(`DENSE_SEMANTIC_PLAN_IDENTITY=${densePlanIdentity}`);
console.log(`COMPLETED_AI_CALLS=${preflight.completed_ai_calls}`);
console.log(`REMAINING_AI_CALLS=${preflight.estimated_ai_calls}`);
console.log(`TOTAL_PLANNED_AI_CALLS=${preflight.total_planned_ai_calls}`);
console.log(`REMAINING_ESTIMATED_PRICE=${preflight.cost_estimate?.estimated_customer_price}`);
console.log(`TOTAL_MAXIMUM_PRICE=${preflight.total_estimated_customer_price}`);
console.log(`CURRENCY=${currency}`);
console.log("PRODUCTION_AUTHORIZED=NO");
console.log("============================================================");

const idempotencyKey = [
  "creative-dense-semantic-recovery-v1",
  projectId,
  densePlanIdentity,
].join(":");
const { job: enqueued, created } = await CreativeExecutionJobRepository.enqueue({
  organization_id: organizationId,
  creative_project_id: projectId,
  job_type: "DENSE_SEMANTIC_RECOVERY",
  idempotency_key: idempotencyKey,
  priority: 40,
  maximum_attempts: 200,
  payload: {
    project_shortlist_identity: projectShortlistIdentity,
    dense_semantic_plan_identity: densePlanIdentity,
    authorization,
    policy,
    country,
    currency,
    preflight,
    production_authorized: false,
  },
  progress: {
    stage: "QUEUED",
    message: "Waiting to analyse the remaining dense semantic frames",
    completed_ai_calls: preflight.completed_ai_calls,
    remaining_ai_calls: preflight.estimated_ai_calls,
    production_started: false,
  },
});
const targetJobId = enqueued.id;
console.log(`JOB_ID=${targetJobId}`);
console.log(`JOB_CREATED=${created ? "YES" : "NO"}`);

async function unrelatedActiveJobs() {
  const { data, error } = await supabaseAdmin
    .from("creative_execution_jobs")
    .select("id,creative_project_id,status,job_type")
    .eq("organization_id", organizationId)
    .in("status", ["QUEUED", "RUNNING", "RETRY"])
    .neq("id", targetJobId);
  if (error) throw error;
  return data || [];
}

for (let cycle = 1; cycle <= 1000; cycle += 1) {
  const target = await CreativeExecutionJobRepository.getById(targetJobId);
  if (!target) throw new Error(`DENSE_RECOVERY_JOB_NOT_FOUND:${targetJobId}`);
  if (target.status === "COMPLETED") {
    console.log("============================================================");
    console.log("DENSE_RECOVERY_STATUS=COMPLETED");
    console.log(`CYCLES=${cycle - 1}`);
    console.log(`COMPLETED_AI_CALLS=${target.result?.completed_ai_calls ?? ""}`);
    console.log(
      `VERIFIED_CANDIDATE_COUNT=${target.result?.verified_candidate_count ?? ""}`,
    );
    console.log(
      `REJECTED_CANDIDATE_COUNT=${target.result?.rejected_candidate_count ?? ""}`,
    );
    console.log("PRODUCTION_STARTED=NO");
    console.log("============================================================");
    process.exit(0);
  }
  if (target.status === "FAILED") {
    throw new Error(
      `DENSE_RECOVERY_JOB_FAILED:${target.error?.message || "unknown"}`,
    );
  }

  const unrelated = await unrelatedActiveJobs();
  if (unrelated.length) {
    throw new Error(
      `UNRELATED_ACTIVE_CREATIVE_JOBS_BLOCK_RECOVERY:${unrelated
        .map((job) => `${job.id}:${job.job_type}:${job.status}`)
        .join(",")}`,
    );
  }

  const workerId = `cole-dense-recovery-${process.pid}-${crypto.randomUUID()}`;
  const claimed = await CreativeExecutionJobRepository.claim({
    worker_id: workerId,
    job_types: ["DENSE_SEMANTIC_RECOVERY"],
    lease_seconds: 900,
  });
  if (!claimed) {
    await sleep(1000);
    continue;
  }
  if (claimed.id !== targetJobId) {
    throw new Error(`DENSE_RECOVERY_CLAIMED_WRONG_JOB:${claimed.id}`);
  }

  const context = {
    job_id: claimed.id,
    job_lease_token: claimed.lease_token,
    maximum_new_provider_steps: batchSize,
    new_provider_steps: 0,
    heartbeat: (progress = {}) => CreativeExecutionJobRepository.heartbeat({
      job_id: claimed.id,
      lease_token: claimed.lease_token,
      lease_seconds: 900,
      progress: {
        ...progress,
        worker_id: workerId,
        batch_provider_step_limit: batchSize,
        production_started: false,
        heartbeat_at: new Date().toISOString(),
      },
    }),
  };

  try {
    const result = await CreativeExecutionContextRuntime.run(
      context,
      () => CreativeDenseSemanticRecoveryRuntime.execute({
        job: claimed,
        organization_id: organizationId,
        creative_project_id: projectId,
        authorization,
        policy,
        country,
        currency,
      }),
    );
    await CreativeExecutionJobRepository.complete({
      job_id: claimed.id,
      lease_token: claimed.lease_token,
      result: {
        ...object(result),
        production_started: false,
      },
      progress: {
        stage: "COMPLETED",
        message: "Dense semantic recovery completed",
        batch_provider_steps_completed: context.new_provider_steps,
        production_started: false,
        completed_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    const controlled = [
      "CREATIVE_EXECUTION_BATCH_LIMIT_REACHED",
      "CREATIVE_EXECUTION_STEP_BUSY",
    ].includes(error?.code || error?.message);
    if (!controlled) {
      await CreativeExecutionJobRepository.retry({
        job_id: claimed.id,
        lease_token: claimed.lease_token,
        error: {
          message: error?.message || String(error),
          cause: error?.cause?.message || null,
        },
        progress: {
          stage: "RETRY_SCHEDULED",
          message: error?.message || String(error),
          batch_provider_steps_completed: context.new_provider_steps,
          production_started: false,
        },
        delay_seconds: 15,
      });
      throw error;
    }
    await CreativeExecutionJobRepository.yield({
      job_id: claimed.id,
      lease_token: claimed.lease_token,
      delay_seconds: error?.code === "CREATIVE_EXECUTION_STEP_BUSY" ? 15 : 0,
      progress: {
        stage: "BATCH_CHECKPOINTED",
        message: "Dense recovery batch checkpointed",
        batch_provider_steps_completed: context.new_provider_steps,
        batch_provider_step_limit: batchSize,
        production_started: false,
      },
    });
  }

  const refreshed = await CreativeExecutionJobRepository.getById(targetJobId);
  console.log([
    `CYCLE=${cycle}`,
    `STATUS=${refreshed?.status || "UNKNOWN"}`,
    `STAGE=${refreshed?.progress?.stage || ""}`,
    `BATCH_PROVIDER_STEPS=${refreshed?.progress?.batch_provider_steps_completed ?? ""}`,
  ].join(" "));
}

throw new Error("DENSE_RECOVERY_CYCLE_LIMIT_EXCEEDED");
