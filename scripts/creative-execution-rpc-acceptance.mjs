#!/usr/bin/env node

import nextEnv from "@next/env";
import crypto from "node:crypto";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const {
  supabaseAdmin,
} = await import("../lib/shared/supabase/admin.js");

const organizationId =
  "9550b843-b83c-4d15-b02d-a0b5ca23346e";
const projectId =
  "3866623f-d9a6-45d3-99b8-e978666cc028";
const runId = crypto.randomUUID();
const jobType = `CREATIVE_RPC_ACCEPTANCE_${runId}`;
const idempotencyPrefix = `creative-rpc-acceptance:${runId}`;

const createdJobIds = [];

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

async function count(table, configure = (query) => query) {
  let query = supabaseAdmin
    .from(table)
    .select("id", {
      count: "exact",
      head: true,
    });

  query = configure(query);

  const { count: total, error } = await query;
  if (error) throw error;
  return Number(total || 0);
}

async function snapshotBusinessState() {
  return {
    usage: await count(
      "platform_service_usage",
      (query) => query.eq("organization_id", organizationId),
    ),
    wallet: await count(
      "wallet_transactions",
      (query) => query.eq("organization_id", organizationId),
    ),
  };
}

async function insertJob(suffix, maximumAttempts = 20) {
  const { data, error } = await supabaseAdmin
    .from("creative_execution_jobs")
    .insert({
      organization_id: organizationId,
      creative_project_id: projectId,
      job_type: jobType,
      idempotency_key: `${idempotencyPrefix}:${suffix}`,
      status: "QUEUED",
      payload: {
        acceptance_test: true,
        run_id: runId,
        suffix,
        production_started: false,
      },
      progress: {
        stage: "ACCEPTANCE_TEST",
        production_started: false,
      },
      maximum_attempts: maximumAttempts,
      priority: -1000,
    })
    .select("*")
    .single();

  if (error) throw error;
  createdJobIds.push(data.id);
  return data;
}

async function rpc(name, args) {
  const { data, error } = await supabaseAdmin.rpc(name, args);
  if (error) throw error;
  return data;
}

async function expectRpcFailure(name, args, expectedMessage) {
  const { error } = await supabaseAdmin.rpc(name, args);
  requireCondition(Boolean(error), `${name}_EXPECTED_FAILURE_MISSING`);
  requireCondition(
    String(error.message || "").includes(expectedMessage),
    `${name}_UNEXPECTED_ERROR:${error.message}`,
  );
}

async function claimJob(workerId) {
  const claimed = await rpc(
    "claim_creative_execution_job",
    {
      p_worker_id: workerId,
      p_job_types: [jobType],
      p_lease_seconds: 120,
    },
  );

  requireCondition(claimed?.id, "CLAIMED_JOB_MISSING");
  requireCondition(claimed.status === "RUNNING", "CLAIMED_JOB_NOT_RUNNING");
  requireCondition(Boolean(claimed.lease_token), "CLAIMED_JOB_LEASE_TOKEN_MISSING");
  return claimed;
}

async function cleanup() {
  if (!createdJobIds.length) return;

  const { error } = await supabaseAdmin
    .from("creative_execution_jobs")
    .delete()
    .in("id", createdJobIds);

  if (error) throw error;
}

const beforeBusiness = await snapshotBusinessState();

let failure = null;

try {
  const lifecycleJob = await insertJob("lifecycle");
  const firstClaim = await claimJob(`acceptance-worker-a-${runId}`);
  requireCondition(firstClaim.id === lifecycleJob.id, "WRONG_LIFECYCLE_JOB_CLAIMED");
  requireCondition(firstClaim.attempt_count === 1, "FIRST_JOB_ATTEMPT_COUNT_INVALID");

  const heartbeat = await rpc(
    "heartbeat_creative_execution_job",
    {
      p_job_id: firstClaim.id,
      p_lease_token: firstClaim.lease_token,
      p_progress: {
        heartbeat_verified: true,
        production_started: false,
      },
      p_lease_seconds: 120,
    },
  );
  requireCondition(
    heartbeat.progress?.heartbeat_verified === true,
    "JOB_HEARTBEAT_PROGRESS_MISSING",
  );

  await expectRpcFailure(
    "heartbeat_creative_execution_job",
    {
      p_job_id: firstClaim.id,
      p_lease_token: crypto.randomUUID(),
      p_progress: {},
      p_lease_seconds: 120,
    },
    "CREATIVE_EXECUTION_JOB_LEASE_INVALID",
  );

  const stepLeaseA = crypto.randomUUID();
  const stepLeaseB = crypto.randomUUID();

  const firstStepClaim = await rpc(
    "claim_creative_execution_step_v2",
    {
      p_job_id: firstClaim.id,
      p_job_lease_token: firstClaim.lease_token,
      p_requested_step_lease_token: stepLeaseA,
      p_step_key: "frame:owner-token",
      p_step_type: "SHORTLIST_FRAME_VERIFY",
      p_input_fingerprint: `fingerprint:${runId}:owner`,
      p_payload: {
        acceptance_test: true,
        production_started: false,
      },
      p_lease_seconds: 120,
    },
  );

  requireCondition(firstStepClaim.status === "RUNNING", "FIRST_STEP_NOT_RUNNING");
  requireCondition(firstStepClaim.lease_token === stepLeaseA, "FIRST_STEP_OWNER_TOKEN_MISMATCH");
  requireCondition(firstStepClaim.attempt_count === 1, "FIRST_STEP_ATTEMPT_COUNT_INVALID");

  const competingStepClaim = await rpc(
    "claim_creative_execution_step_v2",
    {
      p_job_id: firstClaim.id,
      p_job_lease_token: firstClaim.lease_token,
      p_requested_step_lease_token: stepLeaseB,
      p_step_key: "frame:owner-token",
      p_step_type: "SHORTLIST_FRAME_VERIFY",
      p_input_fingerprint: `fingerprint:${runId}:owner`,
      p_payload: {
        competing_worker: true,
      },
      p_lease_seconds: 120,
    },
  );

  requireCondition(competingStepClaim.status === "RUNNING", "COMPETING_STEP_STATUS_INVALID");
  requireCondition(competingStepClaim.lease_token === stepLeaseA, "COMPETING_WORKER_STOLE_STEP_LEASE");
  requireCondition(competingStepClaim.attempt_count === 1, "COMPETING_CLAIM_INCREMENTED_ATTEMPT");

  await expectRpcFailure(
    "complete_creative_execution_step",
    {
      p_step_id: firstStepClaim.id,
      p_step_lease_token: stepLeaseB,
      p_result: {},
      p_usage_ids: [],
      p_provider_call_count: 0,
    },
    "CREATIVE_EXECUTION_STEP_LEASE_INVALID",
  );

  const completedStep = await rpc(
    "complete_creative_execution_step",
    {
      p_step_id: firstStepClaim.id,
      p_step_lease_token: stepLeaseA,
      p_result: {
        acceptance_test: true,
        provider_called: false,
      },
      p_usage_ids: [],
      p_provider_call_count: 0,
    },
  );

  requireCondition(completedStep.status === "COMPLETED", "STEP_COMPLETION_FAILED");
  requireCondition(completedStep.provider_call_count === 0, "STEP_PROVIDER_COUNT_CHANGED");

  const terminalStepClaim = await rpc(
    "claim_creative_execution_step_v2",
    {
      p_job_id: firstClaim.id,
      p_job_lease_token: firstClaim.lease_token,
      p_requested_step_lease_token: crypto.randomUUID(),
      p_step_key: "frame:owner-token",
      p_step_type: "SHORTLIST_FRAME_VERIFY",
      p_input_fingerprint: `fingerprint:${runId}:owner`,
      p_payload: {},
      p_lease_seconds: 120,
    },
  );

  requireCondition(terminalStepClaim.status === "COMPLETED", "TERMINAL_STEP_NOT_REUSED");
  requireCondition(terminalStepClaim.attempt_count === 1, "TERMINAL_STEP_ATTEMPT_CHANGED");

  const yielded = await rpc(
    "yield_creative_execution_job",
    {
      p_job_id: firstClaim.id,
      p_lease_token: firstClaim.lease_token,
      p_progress: {
        yield_verified: true,
        production_started: false,
      },
      p_delay_seconds: 0,
    },
  );

  requireCondition(yielded.status === "QUEUED", "JOB_YIELD_FAILED");
  requireCondition(!yielded.lease_token, "YIELDED_JOB_LEASE_NOT_CLEARED");

  const secondClaim = await claimJob(`acceptance-worker-b-${runId}`);
  requireCondition(secondClaim.id === lifecycleJob.id, "WRONG_RESUMED_JOB_CLAIMED");
  requireCondition(secondClaim.attempt_count === 2, "RESUMED_JOB_ATTEMPT_COUNT_INVALID");

  const staleStepLease = crypto.randomUUID();
  const staleStep = await rpc(
    "claim_creative_execution_step_v2",
    {
      p_job_id: secondClaim.id,
      p_job_lease_token: secondClaim.lease_token,
      p_requested_step_lease_token: staleStepLease,
      p_step_key: "frame:stale-lease",
      p_step_type: "SHORTLIST_FRAME_VERIFY",
      p_input_fingerprint: `fingerprint:${runId}:stale`,
      p_payload: {
        acceptance_test: true,
      },
      p_lease_seconds: 120,
    },
  );

  const { error: expireError } = await supabaseAdmin
    .from("creative_execution_steps")
    .update({
      lease_expires_at: new Date(Date.now() - 60000).toISOString(),
    })
    .eq("id", staleStep.id)
    .eq("lease_token", staleStepLease);

  if (expireError) throw expireError;

  const recoveredStaleStep = await rpc(
    "claim_creative_execution_step_v2",
    {
      p_job_id: secondClaim.id,
      p_job_lease_token: secondClaim.lease_token,
      p_requested_step_lease_token: crypto.randomUUID(),
      p_step_key: "frame:stale-lease",
      p_step_type: "SHORTLIST_FRAME_VERIFY",
      p_input_fingerprint: `fingerprint:${runId}:stale`,
      p_payload: {},
      p_lease_seconds: 120,
    },
  );

  requireCondition(recoveredStaleStep.status === "AMBIGUOUS", "STALE_STEP_NOT_AMBIGUOUS");
  requireCondition(recoveredStaleStep.provider_call_count === 1, "STALE_STEP_PROVIDER_COUNT_NOT_CONSERVATIVE");
  requireCondition(recoveredStaleStep.error?.retry_same_frame === false, "STALE_STEP_RETRY_NOT_BLOCKED");

  const reconciledStep = await rpc(
    "reconcile_creative_execution_step",
    {
      p_step_id: recoveredStaleStep.id,
      p_status: "COMPLETED",
      p_result: {
        acceptance_test: true,
        reconciliation_verified: true,
      },
      p_error: {},
      p_usage_ids: [],
      p_provider_call_count: 1,
    },
  );

  requireCondition(reconciledStep.status === "COMPLETED", "STEP_RECONCILIATION_FAILED");
  requireCondition(reconciledStep.provider_call_count === 1, "RECONCILED_PROVIDER_COUNT_INVALID");

  const completedJob = await rpc(
    "complete_creative_execution_job",
    {
      p_job_id: secondClaim.id,
      p_lease_token: secondClaim.lease_token,
      p_result: {
        acceptance_test: true,
        provider_called: false,
        production_started: false,
      },
      p_progress: {
        stage: "ACCEPTANCE_COMPLETE",
        production_started: false,
      },
    },
  );

  requireCondition(completedJob.status === "COMPLETED", "JOB_COMPLETION_FAILED");

  const permanentJob = await insertJob("permanent", 20);
  const permanentClaim = await claimJob(`acceptance-worker-permanent-${runId}`);
  requireCondition(permanentClaim.id === permanentJob.id, "WRONG_PERMANENT_JOB_CLAIMED");

  const permanentFailure = await rpc(
    "retry_creative_execution_job",
    {
      p_job_id: permanentClaim.id,
      p_lease_token: permanentClaim.lease_token,
      p_error: {
        code: "ACCEPTANCE_PERMANENT_FAILURE",
        permanent: true,
      },
      p_progress: {
        stage: "FAILED",
        production_started: false,
      },
      p_delay_seconds: 0,
    },
  );

  requireCondition(permanentFailure.status === "FAILED", "PERMANENT_FAILURE_NOT_TERMINAL");
  requireCondition(Boolean(permanentFailure.completed_at), "PERMANENT_FAILURE_COMPLETED_AT_MISSING");
  requireCondition(!permanentFailure.lease_token, "PERMANENT_FAILURE_LEASE_NOT_CLEARED");

  const transientJob = await insertJob("transient", 20);
  const transientClaim = await claimJob(`acceptance-worker-transient-${runId}`);
  requireCondition(transientClaim.id === transientJob.id, "WRONG_TRANSIENT_JOB_CLAIMED");

  const transientRetry = await rpc(
    "retry_creative_execution_job",
    {
      p_job_id: transientClaim.id,
      p_lease_token: transientClaim.lease_token,
      p_error: {
        code: "ACCEPTANCE_TRANSIENT_FAILURE",
        permanent: false,
      },
      p_progress: {
        stage: "RETRY_SCHEDULED",
        production_started: false,
      },
      p_delay_seconds: 3600,
    },
  );

  requireCondition(transientRetry.status === "RETRY", "TRANSIENT_FAILURE_NOT_RETRY");
  requireCondition(!transientRetry.completed_at, "TRANSIENT_RETRY_MARKED_COMPLETE");

  console.log("JOB_CLAIM=PASS");
  console.log("JOB_HEARTBEAT=PASS");
  console.log("INVALID_JOB_LEASE_REJECTED=PASS");
  console.log("STEP_OWNER_TOKEN_ACQUISITION=PASS");
  console.log("CONCURRENT_STEP_LEASE_STEAL_BLOCKED=PASS");
  console.log("INVALID_STEP_COMPLETION_REJECTED=PASS");
  console.log("STEP_COMPLETION=PASS");
  console.log("TERMINAL_STEP_REUSE=PASS");
  console.log("JOB_YIELD=PASS");
  console.log("JOB_RESUME=PASS");
  console.log("STALE_STEP_AMBIGUITY=PASS");
  console.log("SAME_FRAME_RETRY_BLOCKED=PASS");
  console.log("STEP_RECONCILIATION=PASS");
  console.log("JOB_COMPLETION=PASS");
  console.log("PERMANENT_FAILURE_TERMINAL=PASS");
  console.log("TRANSIENT_FAILURE_RETRY=PASS");
} catch (error) {
  failure = error;
}

try {
  await cleanup();
} catch (cleanupError) {
  failure = failure || cleanupError;
}

const remainingJobs = await count(
  "creative_execution_jobs",
  (query) => query.like("idempotency_key", `${idempotencyPrefix}%`),
);
const remainingSteps = await count(
  "creative_execution_steps",
  (query) => query.in("job_id", createdJobIds.length ? createdJobIds : [crypto.randomUUID()]),
);
const afterBusiness = await snapshotBusinessState();

requireCondition(remainingJobs === 0, `FIXTURE_JOB_CLEANUP_FAILED:${remainingJobs}`);
requireCondition(remainingSteps === 0, `FIXTURE_STEP_CLEANUP_FAILED:${remainingSteps}`);
requireCondition(beforeBusiness.usage === afterBusiness.usage, "USAGE_ROW_COUNT_CHANGED");
requireCondition(beforeBusiness.wallet === afterBusiness.wallet, "WALLET_ROW_COUNT_CHANGED");

console.log("FIXTURE_JOB_CLEANUP=PASS");
console.log("FIXTURE_STEP_CLEANUP=PASS");
console.log("USAGE_ROW_COUNT_UNCHANGED=PASS");
console.log("WALLET_ROW_COUNT_UNCHANGED=PASS");
console.log("WORKER_CALLED=NO");
console.log("PROVIDER_CALLS=NO");
console.log("WALLET_MUTATIONS=NO");
console.log("PRODUCTION_AUTHORIZED=NO");
console.log("PRODUCTION_STARTED=NO");

if (failure) throw failure;
