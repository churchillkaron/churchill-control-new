import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  platform: "lib/platform/runtime/PlatformDomainRuntime.js",
  secretaryCapability: "lib/platform/capabilities/createSecretaryCapability.js",
  secretaryJobCapability: "lib/platform/capabilities/createSecretaryJobCapability.js",
  secretaryJobIntake: "lib/operator/secretary/SecretaryJobIntakeRuntime.js",
  secretaryJobExecution: "lib/operator/secretary/SecretaryJobExecutionRuntime.js",
  secretaryJobApproval: "lib/operator/secretary/SecretaryJobApprovalRuntime.js",
  secretaryJobCalendar: "lib/operator/secretary/SecretaryJobCalendarRuntime.js",
  secretaryBriefingCapability: "lib/platform/capabilities/createSecretaryExecutiveBriefingCapability.js",
  secretaryBriefingRuntime: "lib/operator/secretary/SecretaryExecutiveBriefingRuntime.js",
  meetingRuntime: "lib/operator/secretary/SecretaryMeetingRuntime.js",
};

const source = Object.fromEntries(
  await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")])),
);

for (const action of [
  "readAgenda",
  "scanDueWork",
  "createCalendarEvent",
  "updateCalendarEvent",
  "listContacts",
  "createContact",
  "upsertContactProfile",
  "listTasks",
  "createTask",
  "updateTask",
  "listFollowUps",
  "createFollowUp",
  "listCalls",
  "readSettings",
  "updateSettings",
]) {
  assert.match(source.platform, new RegExp(`createSecretaryCapability\\(\\"${action}\\"\\)`));
}

for (const action of ["delegate", "list", "read", "approve"]) {
  assert.match(source.platform, new RegExp(`createSecretaryJobCapability\\(\\"${action}\\"\\)`));
}

assert.match(source.platform, /createSecretaryExecutiveBriefingCapability\(\)/);

assert.match(source.secretaryJobCapability, /secretary handle this for me/i);
assert.match(source.secretaryJobCapability, /take care of this/i);
assert.match(source.secretaryJobCapability, /what is my secretary working on/i);
assert.match(source.secretaryJobCapability, /approve this secretary job step/i);
assert.match(source.secretaryJobCapability, /risk:\s*"high"/);
assert.match(source.secretaryJobCapability, /reversible:\s*false/);
assert.match(source.secretaryJobCapability, /operatorRequiresConfirmation:\s*config\.confirm === true/);
assert.match(source.secretaryJobCapability, /conversation_confirmation/);
assert.match(source.secretaryJobCapability, /required:\s*\["job_id",\s*"step_id"\]/);
assert.match(source.secretaryJobCapability, /EXECUTE_WITH_GATES/);
assert.match(source.secretaryJobCapability, /EXECUTE_WITHIN_POLICY/);

assert.match(source.secretaryJobIntake, /source_kind:\s*"MANUAL"/);
assert.match(source.secretaryJobIntake, /status:\s*"QUEUED"/);
assert.match(source.secretaryJobIntake, /next_action_at:\s*now/);
assert.match(source.secretaryJobIntake, /requested_by_party_id:\s*requestedByPartyId/);
assert.match(source.secretaryJobIntake, /secretary_owns_follow_through:\s*true/);
assert.match(source.secretaryJobIntake, /delegated_directly:\s*true/);
assert.match(source.secretaryJobIntake, /secretary_role:\s*"EXECUTIVE_SECRETARY"/);
assert.match(source.secretaryJobIntake, /external_authority_used:\s*false/);
assert.match(source.secretaryJobIntake, /\.eq\("organization_id", organization\)/);
assert.match(source.secretaryJobIntake, /secretary_job_steps/);

for (const actionType of [
  "RESEARCH",
  "DISCOVER_CONTACTS",
  "CALL",
  "MESSAGE",
  "EMAIL",
  "CREATE_TASK",
  "CREATE_EVENT",
  "REVIEW",
]) {
  assert.match(source.secretaryJobExecution, new RegExp(`\\"${actionType}\\"`));
}
assert.match(source.secretaryJobExecution, /HIGH_AUTHORITY_PATTERN/);
assert.match(source.secretaryJobExecution, /purchase_authority_created:\s*false/);
assert.match(source.secretaryJobExecution, /acceptance_authority_created:\s*false/);
assert.match(source.secretaryJobExecution, /runOperatorWebResearch/);
assert.match(source.secretaryJobExecution, /discoverSecretaryProspects/);
assert.match(source.secretaryJobExecution, /ensureSecretaryJobResponseWatcher/);
assert.match(source.secretaryJobExecution, /collectSecretaryJobResponses/);
assert.match(source.secretaryJobExecution, /compareSecretaryJobResponses/);
assert.match(source.secretaryJobExecution, /completed_by:\s*"AVANTIQO_SECRETARY"/);
assert.match(source.secretaryJobExecution, /success_criteria_satisfied/);
assert.match(source.secretaryJobExecution, /remaining_uncertainty/);
assert.match(source.secretaryJobExecution, /job\.autonomy_level === "PLAN_ONLY"/);
assert.match(source.secretaryJobExecution, /completePlanOnlyJob/);
assert.match(source.secretaryJobExecution, /SECRETARY_JOB_PLAN_ONLY_NO_EXECUTION/);
assert.match(source.secretaryJobExecution, /execution_performed:\s*false/);
assert.match(source.secretaryJobExecution, /status:\s*"SKIPPED"/);
assert.match(source.secretaryJobExecution, /executeSecretaryJobCalendarStep/);
assert.match(source.secretaryJobExecution, /hasExactStepApproval/);
assert.match(source.secretaryJobExecution, /approval\.approved_job_id/);
assert.match(source.secretaryJobExecution, /approval\.approved_step_id/);
assert.match(source.secretaryJobExecution, /approval\.approved_action_type/);
assert.match(source.secretaryJobExecution, /approval\.approved_instruction/);
assert.match(source.secretaryJobExecution, /requiresHighAuthority\(step\.instruction\) && !exactApproval/);

assert.match(source.secretaryJobApproval, /EXPLICIT_STEP_APPROVAL/);
assert.match(source.secretaryJobApproval, /scope:\s*"THIS_STEP_ONLY"/);
assert.match(source.secretaryJobApproval, /approved_job_id:\s*job\.id/);
assert.match(source.secretaryJobApproval, /approved_step_id:\s*step\.id/);
assert.match(source.secretaryJobApproval, /approved_action_type:\s*step\.action_type/);
assert.match(source.secretaryJobApproval, /approved_instruction:\s*step\.instruction/);
assert.match(source.secretaryJobApproval, /approved_by_party_id:\s*approvedByPartyId/);
assert.match(source.secretaryJobApproval, /authority_not_extended:\s*true/);
assert.match(source.secretaryJobApproval, /future_steps_authorized:\s*false/);
assert.match(source.secretaryJobApproval, /SECRETARY_JOB_STEP_REQUIRES_INPUT_NOT_APPROVAL/);
assert.match(source.secretaryJobApproval, /SECRETARY_JOB_REVIEW_STEP_NOT_EXECUTABLE_BY_APPROVAL/);
assert.match(source.secretaryJobApproval, /const currentReason = text\(step\.last_error, 200\)/);
assert.match(source.secretaryJobApproval, /if \(currentReason\) return APPROVAL_GATE_REASONS\.has\(currentReason\)/);
assert.match(source.secretaryJobApproval, /\.eq\("organization_id", organization\)/);
assert.match(source.secretaryJobApproval, /status:\s*"QUEUED"/);

assert.match(source.secretaryJobCalendar, /createSecretaryCalendarEventAtomic/);
assert.match(source.secretaryJobCalendar, /Never guess a missing date, time, duration or timezone/i);
assert.match(source.secretaryJobCalendar, /EXACT_ISO_WITH_ZONE/);
assert.match(source.secretaryJobCalendar, /SECRETARY_JOB_EVENT_TIME_REQUIRES_STRUCTURED_DATE/);
assert.match(source.secretaryJobCalendar, /SECRETARY_CALENDAR_SLOT_UNAVAILABLE/);
assert.match(source.secretaryJobCalendar, /SECRETARY_JOB_EVENT_SLOT_UNAVAILABLE/);
assert.match(source.secretaryJobCalendar, /atomic_booking:\s*true/);
assert.match(source.secretaryJobCalendar, /structured_by_existing_intelligence:\s*true/);
assert.match(source.secretaryJobCalendar, /external_authority_used:\s*false/);

assert.match(source.secretaryBriefingCapability, /brief me/i);
assert.match(source.secretaryBriefingCapability, /morning briefing/i);
assert.match(source.secretaryBriefingCapability, /what needs my attention today/i);
assert.match(source.secretaryBriefingCapability, /operatorAutoExecute:\s*true/);
assert.match(source.secretaryBriefingRuntime, /readAgenda/);
assert.match(source.secretaryBriefingRuntime, /scanSecretaryDueWork/);
assert.match(source.secretaryBriefingRuntime, /listSecretaryJobs/);
assert.match(source.secretaryBriefingRuntime, /open_tasks/);
assert.match(source.secretaryBriefingRuntime, /pending_follow_ups/);
assert.match(source.secretaryBriefingRuntime, /recent_calls/);
assert.match(source.secretaryBriefingRuntime, /attention_required/);
assert.match(source.secretaryBriefingRuntime, /secretary_owns_follow_through:\s*true/);
assert.match(source.secretaryBriefingRuntime, /external_authority_used:\s*false/);

assert.match(source.meetingRuntime, /secretary_role:\s*"EXECUTIVE_SECRETARY"/);
assert.match(source.meetingRuntime, /owner_kind as SECRETARY, STAFF, CONTACT, or UNKNOWN/i);
assert.match(source.meetingRuntime, /execution_ready/);
assert.match(source.meetingRuntime, /\.from\("secretary_jobs"\)/);

console.log("OPERATOR_SECRETARY_HUMAN_ROLE_SOURCE_AUDIT=PASS");
console.log("SECRETARY_DIRECT_DELEGATION=true");
console.log("SECRETARY_DURABLE_JOB_OWNERSHIP=true");
console.log("SECRETARY_EXECUTIVE_BRIEFING=true");
console.log("SECRETARY_CALENDAR_ADMIN=true");
console.log("SECRETARY_GOVERNED_CALENDAR_JOB_EXECUTION=true");
console.log("SECRETARY_CALENDAR_AMBIGUITY_FAILS_CLOSED=true");
console.log("SECRETARY_CONTACT_ADMIN=true");
console.log("SECRETARY_TASK_ADMIN=true");
console.log("SECRETARY_FOLLOW_UP_ADMIN=true");
console.log("SECRETARY_CALL_AND_CORRESPONDENCE_ADMIN=true");
console.log("SECRETARY_MEETING_ADMIN=true");
console.log("SECRETARY_AUTONOMOUS_RESEARCH=true");
console.log("SECRETARY_RESPONSE_COLLECTION_AND_CHASING=true");
console.log("SECRETARY_CLOSE_LOOP_JOB_EXECUTION=true");
console.log("SECRETARY_PLAN_ONLY_NO_EXECUTION=true");
console.log("SECRETARY_STEP_BOUND_APPROVAL=true");
console.log("SECRETARY_APPROVAL_DOES_NOT_EXTEND_AUTHORITY=true");
console.log("SECRETARY_OPERATIONAL_INPUT_CANNOT_BE_APPROVED_AWAY=true");
console.log("SECRETARY_OPERATIONAL_REVIEW_PRECEDENCE=true");
console.log("SECRETARY_HIGH_AUTHORITY_GATES=true");
console.log("SECRETARY_RUNTIME_CERTIFIED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");