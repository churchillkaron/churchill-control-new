import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const router = await readFile(new URL("../lib/code/runtime/CodeWorkspaceRuntime.js", import.meta.url), "utf8");
const device = await readFile(new URL("../lib/code/runtime/CodeWorkspaceDeviceRuntime.js", import.meta.url), "utf8");
const mission = await readFile(new URL("../app/api/operator/code/mission/route.js", import.meta.url), "utf8");
const agent = await readFile(new URL("../scripts/code-device-agent.mjs", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/20260920123000_avantiqo_code_devices.sql", import.meta.url), "utf8");
const completionMigration = await readFile(new URL("../supabase/migrations/20260924085450_make_code_device_completion_idempotent.sql", import.meta.url), "utf8");
const leaseMigration = await readFile(new URL("../supabase/migrations/20260924090445_renew_code_device_job_leases.sql", import.meta.url), "utf8");
const studio = await readFile(new URL("../components/creative/code/CreativeCodeStudio.jsx", import.meta.url), "utf8");
const devicesRoute = await readFile(new URL("../app/api/operator/code/devices/route.js", import.meta.url), "utf8");

test("Code workspace router supports organization-bound devices", () => {
  assert.match(router, /"DEVICE"/);
  assert.match(router, /CodeWorkspaceDeviceRuntime/);
  assert.match(device, /\.eq\("organization_id", organizationId\)/);
  assert.match(device, /CODE_AI_DEVICE_OFFLINE/);
  assert.doesNotMatch(device, /metrics,node_id,device_id/);
  assert.match(device, /status,result,error_code,metrics,device_id/);
});

test("Code mission accepts explicit connected-computer routing", () => {
  assert.match(mission, /workspace_target/);
  assert.match(mission, /device_id/);
  assert.match(mission, /CODE_STUDIO_DEVICE_ID_REQUIRED/);
});

test("device agent blocks direct external side effects and host-qualified executables", () => {
  assert.match(agent, /CODE_DEVICE_GIT_PUSH_REQUIRES_GOVERNED_COMMIT/);
  assert.match(agent, /CODE_DEVICE_EXTERNAL_SIDE_EFFECT_REQUIRES_GOVERNED_RUNTIME/);
  assert.match(agent, /CODE_DEVICE_PROTECTED_PATH/);
  assert.match(agent, /code\.browser\.verify/);
  assert.match(agent, /raw=text\(command,160\),c=path\.basename\(raw\)\.toLowerCase\(\)/);
  assert.match(agent, /CODE_DEVICE_COMMAND_EXECUTABLE_OUTSIDE_WORKSPACE_BLOCKED/);
  assert.match(agent, /CODE_DEVICE_COMMAND_ARGUMENT_OUTSIDE_WORKSPACE_BLOCKED/);
  assert.match(agent, /unsafeWorkspaceFilesystemArgument/);
  assert.match(agent, /ALLOWED_ENGINEERING_EXECUTABLES/);
  assert.match(agent, /raw\.startsWith\("\.\/"\)/);
  assert.doesNotMatch(agent, /isolatedNextBuildEnvAllowed/);
});

test("device workspaces share bounded worktree locking and source-bound range mutation", () => {
  assert.match(agent, /acquireDeviceWorktreeLock/);
  assert.match(agent, /CODE_DEVICE_WORKTREE_LOCK_TIMEOUT/);
  assert.match(agent, /runTrustedWorktreeGit/);
  assert.match(agent, /CODE_DEVICE_INTERNAL_WORKTREE_COMMAND_INVALID/);
  assert.match(agent, /runTrustedWorktreeGit\(\["worktree","add","--detach",workspace,target\]/);
  assert.match(agent, /runTrustedWorktreeGit\(\["worktree","remove","--force",workspace\]/);
  assert.match(agent, /createDeviceWorktree/);
  assert.match(agent, /cleanupDeviceWorktree/);
  assert.match(agent, /workspace\.replace_range/);
  assert.match(agent, /CODE_AI_REPLACE_RANGE_STALE_SOURCE/);
  assert.match(device, /replaceRange: \(input\) => call\("workspace\.replace_range"/);
});

test("device session resume is bound to expected repository ref and base commit", () => {
  assert.match(device, /repository_url = null/);
  assert.match(device, /ref = null/);
  assert.match(device, /base_commit = null/);
  assert.match(device, /CODE_AI_DEVICE_SESSION_REPOSITORY_MISMATCH/);
  assert.match(device, /CODE_AI_DEVICE_SESSION_REF_MISMATCH/);
  assert.match(device, /CODE_AI_DEVICE_SESSION_BASE_COMMIT_MISMATCH/);
  assert.match(device, /normalizeRepository\(attachedRepositoryUrl\) !== normalizeRepository\(expectedRepositoryUrl\)/);
});

test("device command policy supports the exact shell-free isolated Next.js build environment", () => {
  assert.match(agent, /function exactIsolatedBuildEnvironment/);
  assert.match(agent, /CODE_DEVICE_COMMAND_ENVIRONMENT_NOT_ALLOWED/);
  assert.match(agent, /raw\.toLowerCase\(\)==="npm"/);
  assert.match(agent, /env:env\?\{\.\.\.process\.env,\.\.\.env\}:process\.env/);
  assert.match(device, /env = null/);
  assert.match(device, /workspace\.run/);
});

test("pairing and jobs remain organization and device scoped", () => {
  assert.match(migration, /organization_id uuid not null/);
  assert.match(migration, /pair_avantiqo_code_device/);
  assert.match(migration, /j\.device_id=p_device_id/);
  assert.match(migration, /used_at is null and expires_at > now\(\)/);
});

test("device execution is replay-safe when completion acknowledgement is lost", () => {
  assert.match(agent, /code-device-completed-jobs/);
  assert.match(agent, /async function saveCompletedJob/);
  assert.match(agent, /await rename\(tempPath,finalPath\)/);
  assert.match(agent, /const cached=await loadCompletedJob\(job\.id\)/);
  assert.match(agent, /replayedFromLocalCache=true/);
  assert.match(agent, /await acknowledgeCompletedJob/);
  assert.match(agent, /COMPLETION_ACK_PENDING/);
  assert.match(agent, /COMPLETED_JOB_RETENTION_MS = 7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(agent, /COMPLETED_JOB_SWEEP_INTERVAL_MS = 60 \* 60 \* 1000/);
  assert.match(agent, /async function sweepCompletedJobs/);
  assert.match(agent, /await sweepCompletedJobs\(\)/);
});

test("device completion RPC is idempotent but rejects conflicting replay results", () => {
  assert.match(completionMigration, /status = 'COMPLETED'/);
  assert.match(completionMigration, /and status = 'RUNNING'/);
  assert.match(completionMigration, /and status = 'COMPLETED'/);
  assert.match(completionMigration, /AVANTIQO_CODE_DEVICE_JOB_COMPLETION_RESULT_MISMATCH/);
  assert.match(completionMigration, /revoke all on function public\.complete_avantiqo_code_device_job/);
  assert.match(completionMigration, /grant execute on function public\.complete_avantiqo_code_device_job/);
});

test("long device jobs keep an exclusive renewable lease instead of becoming reclaimable", () => {
  assert.match(agent, /DEVICE_JOB_LEASE_SECONDS = 30 \* 60/);
  assert.match(agent, /DEVICE_JOB_LEASE_RENEW_INTERVAL_MS = 5 \* 60 \* 1000/);
  assert.match(agent, /p_limit:1,p_lease_seconds:DEVICE_JOB_LEASE_SECONDS/);
  assert.match(agent, /startDeviceJobLeaseRenewal/);
  assert.match(agent, /renew_avantiqo_code_device_job_lease/);
  assert.match(agent, /leaseOwnershipLost/);
  assert.match(agent, /const executionController=new AbortController\(\)/);
  assert.match(agent, /executionController\.abort\(\)/);
  assert.match(agent, /dispatch\(config,job,executionController\.signal\)/);
  assert.match(agent, /CODE_DEVICE_JOB_LEASE_OWNERSHIP_LOST/);
  assert.match(agent, /AbortSignal\.timeout/);
  assert.match(leaseMigration, /claim_avantiqo_code_device_jobs/);
  assert.match(leaseMigration, /least\(coalesce\(p_limit, 1\), 1\)/);
  assert.match(leaseMigration, /least\(coalesce\(p_lease_seconds, 1800\), 1800\)/);
  assert.match(leaseMigration, /renew_avantiqo_code_device_job_lease/);
  assert.match(leaseMigration, /and status = 'RUNNING'/);
  assert.match(leaseMigration, /leased_until = now\(\) \+ make_interval/);
  assert.match(leaseMigration, /revoke all on function public\.renew_avantiqo_code_device_job_lease/);
});


test("Code Studio exposes connected-computer state and keeps delivery governed", () => {
  assert.match(studio, /Connected computer/);
  assert.match(studio, /\/api\/operator\/code\/devices/);
  assert.match(studio, /device\.online \? "online" : "offline"/);
  assert.match(studio, /<AvantiqoCodeIDE/);
  assert.match(studio, /organizationId=\{organizationId\}/);
  assert.match(studio, /\/api\/operator\/code\/commit/);
  assert.match(studio, /\/api\/operator\/code\/release/);
  assert.match(devicesRoute, /requiredPermission: REQUIRED_PERMISSION/);
  assert.match(devicesRoute, /\.eq\("organization_id", organizationId\)/);
});
