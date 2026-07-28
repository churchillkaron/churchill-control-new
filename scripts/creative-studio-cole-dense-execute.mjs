#!/usr/bin/env node

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
  CreativeExecutionJobRuntime,
} = await import(
  "@/lib/creative/execution/runtime/CreativeExecutionJobRuntime"
);
const {
  CreativeExecutionJobRepository,
} = await import(
  "@/lib/creative/execution/repositories/CreativeExecutionJobRepository"
);
const { supabaseAdmin } = await import(
  "@/lib/shared/supabase/admin"
);

const policy = {
  maximum_semantic_sample_gap_seconds: maximumGap,
  require_human_approval: true,
};
const authorization = {
  approved: true,
  dense_semantic_plan_identity: densePlanIdentity,
  maximum_ai_calls: maximumAiCalls,
  maximum_customer_price: maximumCustomerPrice,
  currency,
};

const preflight = await CreativeExecutionJobRuntime.preflightShortlistVerification({
  organization_id: organizationId,
  creative_project_id: projectId,
  policy,
  country: process.env.CREATIVE_SMOKE_COUNTRY || "TH",
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
if (Number(preflight.estimated_ai_calls) > maximumAiCalls) {
  mismatches.push("AI_CALL_LIMIT_EXCEEDED");
}
if (
  Number(preflight.cost_estimate?.estimated_customer_price || 0) >
  maximumCustomerPrice + 0.000001
) {
  mismatches.push("CUSTOMER_PRICE_LIMIT_EXCEEDED");
}
if (text(preflight.cost_estimate?.currency).toUpperCase() !== currency) {
  mismatches.push("CURRENCY_MISMATCH");
}
if (mismatches.length) {
  const error = new Error(`DENSE_EXECUTION_AUTHORIZATION_BLOCKED:${mismatches.join(",")}`);
  error.preflight = preflight;
  throw error;
}

console.log("============================================================");
console.log("COLE DENSE SEMANTIC EXECUTION AUTHORIZATION");
console.log("============================================================");
console.log(`ORGANIZATION_ID=${organizationId}`);
console.log(`CREATIVE_PROJECT_ID=${projectId}`);
console.log(`PROJECT_SHORTLIST_IDENTITY=${projectShortlistIdentity}`);
console.log(`DENSE_SEMANTIC_PLAN_IDENTITY=${densePlanIdentity}`);
console.log(`MAXIMUM_AI_CALLS=${maximumAiCalls}`);
console.log(`MAXIMUM_CUSTOMER_PRICE=${maximumCustomerPrice}`);
console.log(`CURRENCY=${currency}`);
console.log(`CURRENT_PENDING_AI_CALLS=${preflight.estimated_ai_calls}`);
console.log(
  `CURRENT_ESTIMATED_CUSTOMER_PRICE=${preflight.cost_estimate?.estimated_customer_price}`,
);
console.log(`PROVIDER=${preflight.cost_estimate?.provider || ""}`);
console.log(`MODEL=${preflight.cost_estimate?.model || ""}`);
console.log("PRODUCTION_AUTHORIZED=NO");
console.log("============================================================");

const enqueued = await CreativeExecutionJobRuntime.enqueueShortlistVerification({
  organization_id: organizationId,
  creative_project_id: projectId,
  project_shortlist_identity: projectShortlistIdentity,
  authorization,
  policy,
  country: process.env.CREATIVE_SMOKE_COUNTRY || "TH",
  currency,
});
const targetJobId = enqueued.job.id;
console.log(`JOB_ID=${targetJobId}`);
console.log(`JOB_CREATED=${enqueued.created ? "YES" : "NO"}`);

async function activeVerificationJobs() {
  const { data, error } = await supabaseAdmin
    .from("creative_execution_jobs")
    .select("id,organization_id,creative_project_id,status,job_type,priority,next_attempt_at")
    .eq("organization_id", organizationId)
    .eq("job_type", "SHORTLIST_VERIFY")
    .in("status", ["QUEUED", "RUNNING", "RETRY"])
    .order("priority", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

for (let cycle = 1; cycle <= 1000; cycle += 1) {
  const target = await CreativeExecutionJobRepository.getById(targetJobId);
  if (!target) throw new Error(`DENSE_EXECUTION_JOB_NOT_FOUND:${targetJobId}`);

  if (target.status === "COMPLETED") {
    console.log("============================================================");
    console.log("DENSE_EXECUTION_STATUS=COMPLETED");
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
      `DENSE_EXECUTION_JOB_FAILED:${target.error?.message || "unknown"}`,
    );
  }

  const active = await activeVerificationJobs();
  const unrelated = active.filter((job) => job.id !== targetJobId);
  if (unrelated.length) {
    throw new Error(
      `UNRELATED_ACTIVE_SHORTLIST_VERIFY_JOBS_BLOCK_EXECUTION:${unrelated
        .map((job) => `${job.id}:${job.creative_project_id}:${job.status}`)
        .join(",")}`,
    );
  }

  const result = await CreativeExecutionJobRuntime.processOne({
    worker_id: `cole-dense-local-${process.pid}`,
    lease_seconds: 900,
    maximum_new_provider_steps: batchSize,
  });
  const refreshed = await CreativeExecutionJobRepository.getById(targetJobId);
  console.log([
    `CYCLE=${cycle}`,
    `CLAIMED=${result.claimed === true ? "YES" : "NO"}`,
    `STATUS=${refreshed?.status || "UNKNOWN"}`,
    `STAGE=${refreshed?.progress?.stage || ""}`,
    `BATCH_PROVIDER_STEPS=${refreshed?.progress?.batch_provider_steps_completed ?? ""}`,
  ].join(" "));

  if (result.claimed !== true) await sleep(1000);
}

throw new Error("DENSE_EXECUTION_CYCLE_LIMIT_EXCEEDED");
