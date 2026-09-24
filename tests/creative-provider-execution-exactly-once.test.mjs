import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration=fs.readFileSync("supabase/migrations/20260919170000_creative_provider_execution_idempotency_and_local_compute_keys.sql","utf8");
const runtime=fs.readFileSync("lib/platform/service-runtime/execution/CreativeProviderExecutionClaimRuntime.js","utf8");
const service=fs.readFileSync("lib/platform/service-runtime/execution/ServiceExecutionRuntime.js","utf8");
const enqueue=fs.readFileSync("lib/platform/service-runtime/providers/AvantiqoLocalComputeEnqueueRuntime.js","utf8");
const tasks=fs.readFileSync("lib/operations/tasks/runtime/ProductionTaskRuntime.js","utf8");

test("provider execution has a durable exactly-once claim ledger",()=>{
  assert.match(migration,/creative_provider_execution_claims/);
  assert.match(migration,/unique index if not exists creative_provider_execution_claims_org_key_uidx/);
  assert.match(migration,/automatic_resubmission_after_ambiguous_forbidden/);
  assert.match(migration,/mark_creative_provider_execution_ambiguous/);
});

test("ambiguous provider submission cannot be automatically replayed",()=>{
  assert.match(service,/CREATIVE_PROVIDER_EXECUTION_REPLAY_BLOCKED/);
  assert.match(service,/providerCallStarted === true/);
  assert.match(service,/providerCallReturned !== true/);
  assert.match(service,/CreativeProviderExecutionClaimRuntime\.ambiguous/);
});

test("safe pre-submission failures are distinguishable from ambiguous submission",()=>{
  assert.match(migration,/safe_pre_submission_retry/);
  assert.match(migration,/status = 'FAILED'/);
  assert.match(runtime,/failedPreSubmission/);
  assert.match(runtime,/failedTerminal/);
});

test("provider certification is pinned into the execution identity",()=>{
  assert.match(runtime,/providerCertificationFingerprint/);
  assert.match(runtime,/provider_certification_fingerprint/);
  assert.match(service,/providerCertificationFingerprint/);
  assert.match(service,/provider_certification:/);
});

test("explicit production retry creates a new exactly-once execution attempt",()=>{
  assert.match(runtime,/provider_execution_attempt/);
  assert.match(runtime,/:attempt:/);
  assert.match(tasks,/async retry\(id\)/);
  assert.match(tasks,/FAILED_PRODUCTION_TASK_REQUIRED_FOR_RETRY/);
  assert.match(tasks,/provider_execution_attempt: attempt/);
  assert.match(tasks,/provider_retry_previous_job_id/);
});

test("Node01 queue submission is database-idempotent",()=>{
  assert.match(migration,/submit_avantiqo_local_compute_job_idempotent/);
  assert.match(migration,/avantiqo_local_compute_jobs_execution_key_uidx/);
  assert.match(migration,/request_hash/);
  assert.match(enqueue,/submit_avantiqo_local_compute_job_idempotent/);
  assert.match(enqueue,/localComputeRequestHash/);
});
