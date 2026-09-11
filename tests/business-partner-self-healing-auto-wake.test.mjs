import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const worker=fs.readFileSync("lib/operator/runtime/BusinessPartnerRepairContinuationWorkerRuntime.js","utf8");
const release=fs.readFileSync("lib/platform/runtime/AvantiqoProductionReleaseRuntime.js","utf8");
const route=fs.readFileSync("app/api/internal/operator/repair-continuations/process/route.js","utf8");
const vercel=JSON.parse(fs.readFileSync("vercel.json","utf8"));

test("pending production repairs are reconciled without creating another deployment",()=>{
  assert.match(worker,/verifyExistingProductionDeployment/);
  assert.match(release,/export async function verifyExistingProductionDeployment/);
  assert.match(release,/\/v13\/deployments\/\$\{encodeURIComponent\(deploymentId\)\}/);
  assert.doesNotMatch(release.slice(release.indexOf("export async function verifyExistingProductionDeployment")),/method:\s*"POST"/);
});

test("repair continuation is exact conversation state with an idempotent lease",()=>{
  assert.match(worker,/AVANTIQO_BUSINESS_PARTNER_REPAIR_CONTINUATION_WAKE_V1/);
  assert.match(worker,/\.eq\("updated_at",row\.updated_at\)/);
  assert.match(worker,/text\(wake\.status,80\)!=="RESUMING"/);
  assert.match(worker,/LEASE_MS = 5 \* 60 \* 1000/);
});

test("ready deployment keeps the lease through replay",()=>{
  assert.match(worker,/updateClaimedRecovery\(row,token,\{deployment_pending:false,production_deploy_performed:true,activation_verified:true,resume_authorized:true/);
  assert.match(worker,/text\(wake\.token,160\)!==text\(token,160\)/);
});

test("worker re-resolves current access and re-enters Business Partner rather than replaying a capability directly",()=>{
  assert.match(worker,/resolveDelegatedOrganizationAccess/);
  assert.match(worker,/runSyntheticIntelligenceTurn/);
  assert.match(worker,/message:"continue",source:"event"/);
  assert.doesNotMatch(worker,/executeUbteCapability/);
});

test("only still-authorized recovery or pending deployment is eligible",()=>{
  assert.match(worker,/recovery\.resume_authorized===true \|\| recovery\.deployment_pending===true/);
  assert.doesNotMatch(worker,/recovery\.activation_verified===true\);/);
});

test("commit identity is verified before wake",()=>{
  assert.match(release,/AVANTIQO_PRODUCTION_RELEASE_COMMIT_MISMATCH/);
  assert.match(release,/observed\.toLowerCase\(\) !== expectedCommit\.toLowerCase\(\)/);
});

test("repair continuation has authenticated minute worker",()=>{
  assert.match(route,/CRON_SECRET/);
  assert.ok(vercel.crons.some(row=>row.path==="/api/internal/operator/repair-continuations/process"&&row.schedule==="* * * * *"));
  assert.equal(vercel.functions["app/api/internal/operator/repair-continuations/process/route.js"].maxDuration,300);
});

test("worker rechecks the live recovery after deployment verification so cancellation wins",()=>{
  assert.match(worker,/reloadClaimedConversation\(active,claimed\.token\)/);
  assert.match(worker,/RECOVERY_CHANGED_AFTER_CLAIM/);
  assert.match(worker,/text\(wake\.execution_key,160\)!==text\(recovery\.execution_key,160\)/);
});

test("repair wake retries are bounded without removing the user's manual recovery path",()=>{
  assert.match(worker,/attempt_count:Number\(object\(recovery\.repair_continuation_wake\)\.attempt_count\|\|0\)\+1/);
  assert.match(worker,/const retryable=attempts<5/);
  assert.match(worker,/wake_status:retryable\?"RETRY_PENDING":"BLOCKED"/);
  assert.match(worker,/if \(text\(wake\.status,80\)==="BLOCKED"\) return false/);
});
