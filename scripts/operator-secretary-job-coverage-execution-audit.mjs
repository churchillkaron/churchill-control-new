import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) throw new Error(`SECRETARY_JOB_COVERAGE_EXECUTION_AUDIT_MISSING:${label}`);
}

const routing = read("lib/operator/secretary/SecretaryJobCoverageExecutionRuntime.js");
const execution = read("lib/operator/secretary/SecretaryJobExecutionRuntime.js");
const calendar = read("lib/operator/secretary/SecretaryJobCalendarRuntime.js");

requireText(routing, "AVANTIQO_EXECUTIVE_SECRETARY_JOB_COVERAGE_EXECUTION_V1", "ROUTING_CONTRACT");
requireText(routing, "resolveSecretaryAdministrativeCoverage", "SHARED_ADMINISTRATIVE_RESOLVER");
requireText(routing, "artifact_owner_party_id: explicitTargetPartyId || canonicalOwnerPartyId", "EXPLICIT_TARGET_OR_CANONICAL_OWNER");
requireText(routing, "execution_actor_party_id: text(routing.operational_assignee_party_id", "OPERATIONAL_EXECUTION_ACTOR");
requireText(routing, "approval_authority_delegated: false", "NO_APPROVAL_AUTHORITY");
requireText(routing, "binding_authority_delegated: false", "NO_BINDING_AUTHORITY");
requireText(routing, "platform_permissions_mutated: false", "NO_PERMISSION_MUTATION");

requireText(execution, "secretaryJobExactApprovalOwnedByCanonicalOwner", "EXECUTION_APPROVAL_OWNER_RECHECK");
requireText(execution, "resolveSecretaryJobStepExecutionCoverage", "LIVE_STEP_COVERAGE_RESOLUTION");
requireText(execution, "owner_party_id: routing.canonical_owner_party_id", "FOLLOW_UP_CANONICAL_OWNER");
requireText(execution, "secretary_job_communication_coverage_snapshot: true", "COMMUNICATION_COVERAGE_SNAPSHOT");
requireText(execution, "actor: { partyId: routing.execution_actor_party_id }", "TASK_EXECUTION_ACTOR");
requireText(execution, "owner_party_id: routing.artifact_owner_party_id", "TASK_OWNER_PRESERVATION");
requireText(execution, "executeSecretaryJobCalendarStep({ job, step, routing, routingMetadata })", "CALENDAR_ROUTING_HANDOFF");

requireText(calendar, "owner_party_id: canonicalOwnerPartyId", "CALENDAR_CANONICAL_OWNER");
requireText(calendar, "actor: { partyId: executionActorPartyId }", "CALENDAR_OPERATIONAL_ACTOR");
requireText(calendar, "secretary_calendar_owner_preserved: true", "CALENDAR_OWNER_PRESERVED_MARKER");
requireText(calendar, "external_authority_used: false", "NO_EXTERNAL_AUTHORITY");

console.log("OPERATOR_SECRETARY_JOB_COVERAGE_EXECUTION_AUDIT=PASS");
console.log("SECRETARY_JOB_COVERAGE_EXECUTION_LIVE_ROUTING=true");
console.log("SECRETARY_JOB_COVERAGE_EXECUTION_CANONICAL_OWNER_PRESERVED=true");
console.log("SECRETARY_JOB_COVERAGE_EXECUTION_OPERATIONAL_ASSIGNEE=true");
console.log("SECRETARY_JOB_COVERAGE_EXECUTION_EXPLICIT_TARGET_PRESERVED=true");
console.log("SECRETARY_JOB_COVERAGE_EXECUTION_APPROVAL_OWNER_RECHECK=true");
console.log("SECRETARY_JOB_COVERAGE_EXECUTION_CALENDAR_OWNER_PRESERVED=true");
console.log("SECRETARY_JOB_COVERAGE_EXECUTION_PLATFORM_PERMISSIONS_MUTATED=false");
console.log("SECRETARY_JOB_COVERAGE_EXECUTION_BINDING_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_JOB_COVERAGE_EXECUTION_APPROVAL_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
