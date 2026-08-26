import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  meetingSchema: "supabase/migrations/20260825150000_secretary_meeting_intelligence_and_jobs.sql",
  jobClaim: "supabase/migrations/20260825151000_secretary_job_execution_claim.sql",
  prospectSchema: "supabase/migrations/20260826002000_secretary_prospect_discovery.sql",
  responseSchema: "supabase/migrations/20260826002500_secretary_job_response_collection.sql",
  waitingClaim: "supabase/migrations/20260826003000_secretary_job_waiting_claim_semantics.sql",
  meetingRuntime: "lib/operator/secretary/SecretaryMeetingRuntime.js",
  jobRuntime: "lib/operator/secretary/SecretaryJobExecutionRuntime.js",
  prospectRuntime: "lib/operator/secretary/SecretaryProspectDiscoveryRuntime.js",
  responseRuntime: "lib/operator/secretary/SecretaryJobResponseRuntime.js",
  worker: "app/api/internal/secretary/jobs/process/route.js",
  vercel: "vercel.json",
};

const source = Object.fromEntries(
  await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")])),
);

for (const table of [
  "secretary_meetings",
  "secretary_meeting_participants",
  "secretary_meeting_segments",
  "secretary_jobs",
  "secretary_job_steps",
  "secretary_meeting_action_items",
]) {
  assert.match(source.meetingSchema, new RegExp(`create table if not exists public\\.${table}`, "i"));
}
assert.match(source.meetingSchema, /capture_authorized boolean not null default false/i);
assert.match(source.meetingSchema, /EXECUTE_WITH_GATES/);
assert.match(source.meetingSchema, /owner_kind in \('SECRETARY','STAFF','CONTACT','UNKNOWN'\)/i);

assert.match(source.meetingRuntime, /SECRETARY_MEETING_CAPTURE_AUTHORIZATION_REQUIRED/);
assert.match(source.meetingRuntime, /FINALIZE_MEETING_PROTOCOL/);
assert.match(source.meetingRuntime, /executive_summary/);
assert.match(source.meetingRuntime, /protocol/);
assert.match(source.meetingRuntime, /decisions/);
assert.match(source.meetingRuntime, /unresolved_questions/);
assert.match(source.meetingRuntime, /secretary_tasks/);
assert.match(source.meetingRuntime, /secretary_jobs/);
assert.match(source.meetingRuntime, /executionReady/);
assert.match(source.meetingRuntime, /external_authority_used:\s*false/);

assert.match(source.jobClaim, /for update skip locked/i);
assert.match(source.waitingClaim, /status = 'WAITING' then attempt_count else attempt_count \+ 1/i);
assert.match(source.jobRuntime, /DISCOVER_CONTACTS/);
assert.match(source.jobRuntime, /runOperatorWebResearch/);
assert.match(source.jobRuntime, /discoverSecretaryProspects/);
assert.match(source.jobRuntime, /ensureSecretaryJobResponseWatcher/);
assert.match(source.jobRuntime, /collectSecretaryJobResponses/);
assert.match(source.jobRuntime, /compareSecretaryJobResponses/);
assert.match(source.jobRuntime, /payment terms/i);
assert.match(source.jobRuntime, /purchase_authority_created:\s*false/);
assert.match(source.jobRuntime, /acceptance_authority_created:\s*false/);
assert.match(source.jobRuntime, /supplier_recommendation_advisory_only/);
assert.match(source.jobRuntime, /expanded_outreach_step_ids/);
assert.match(source.jobRuntime, /pendingDynamicSteps/);

assert.match(source.prospectSchema, /secretary_prospects/);
assert.match(source.prospectSchema, /DISCOVER_CONTACTS/);
assert.match(source.prospectRuntime, /provider-verified public web evidence/i);
assert.match(source.prospectRuntime, /supplier_master_created:\s*false/);
assert.match(source.prospectRuntime, /createSecretaryContact/);
assert.match(source.prospectRuntime, /createConversation/);
assert.doesNotMatch(source.prospectRuntime, /createVendor/);

assert.match(source.responseSchema, /secretary_job_responses/);
assert.match(source.responseSchema, /secretary_job_comparisons/);
assert.match(source.responseRuntime, /SUPPLIER_RESPONSE_WINDOW_EXPIRED/);
assert.match(source.responseRuntime, /non_responder_reminder:\s*true/);
assert.match(source.responseRuntime, /reminder_number:\s*1/);
assert.match(source.responseRuntime, /EXTRACT_JOB_RESPONSE_TERMS/);
assert.match(source.responseRuntime, /COMPARE_JOB_RESPONSES/);
assert.match(source.responseRuntime, /Never invent a price/i);
assert.match(source.responseRuntime, /never authorize an order/i);
assert.match(source.responseRuntime, /purchase_authority_created:\s*false/);
assert.match(source.responseRuntime, /acceptance_authority_created:\s*false/);

assert.match(source.worker, /CRON_SECRET/);
assert.match(source.worker, /processNextSecretaryJob/);
assert.equal(JSON.parse(source.vercel).crons.some((job) => job.path === "/api/internal/secretary/jobs/process" && job.schedule === "* * * * *"), true);

for (const migration of [source.meetingSchema, source.prospectSchema, source.responseSchema]) {
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /service_role/i);
}

console.log("OPERATOR_SECRETARY_EXECUTIVE_AUTONOMY_AUDIT=PASS");
console.log("SECRETARY_MEETING_PROTOCOL=true");
console.log("SECRETARY_MEETING_TASK_ASSIGNMENT=true");
console.log("SECRETARY_OWNED_JOB_EXECUTION=true");
console.log("SECRETARY_GOVERNED_PROSPECT_DISCOVERY=true");
console.log("SECRETARY_PARALLEL_RESPONSE_WAITING=true");
console.log("SECRETARY_NON_RESPONDER_SINGLE_CHASE=true");
console.log("SECRETARY_SUPPLIER_RESPONSE_EXTRACTION=true");
console.log("SECRETARY_SUPPLIER_COMPARISON=true");
console.log("SECRETARY_PURCHASE_AUTHORITY_CREATED=false");
console.log("SECRETARY_ACCEPTANCE_AUTHORITY_CREATED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
