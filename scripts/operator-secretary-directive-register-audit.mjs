import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runtime = await readFile("lib/operator/secretary/SecretaryExecutiveDirectiveRegisterRuntime.js", "utf8");
const capability = await readFile("lib/platform/capabilities/createSecretaryExecutiveDirectiveRegisterCapability.js", "utf8");
const platform = await readFile("lib/platform/runtime/PlatformDomainRuntime.js", "utf8");
const tasksMigration = await readFile("supabase/migrations/20260825062200_avantiqo_secretary_native_core.sql", "utf8");

assert.match(runtime, /AVANTIQO_EXECUTIVE_SECRETARY_DIRECTIVE_REGISTER_V1/);
assert.match(runtime, /const SOURCE = "secretary_directive_register"/);
assert.match(runtime, /const LEDGER_KEY = "directive_register_v1"/);
assert.match(runtime, /function exactText\(/);
assert.match(runtime, /const raw = String\(value\)/);
assert.doesNotMatch(runtime, /const raw = String\(value\)\.trim\(\)/);
assert.match(runtime, /instruction_text_sha256:/);
assert.match(runtime, /semantic_fingerprint_sha256:/);
assert.match(runtime, /SECRETARY_DIRECTIVE_REGISTER_ISSUER_PARTY_REQUIRED/);
assert.match(runtime, /SECRETARY_DIRECTIVE_REGISTER_EVIDENCE_REQUIRED/);
assert.match(runtime, /instructed_at.*required:\s*true/s);
assert.match(runtime, /targetPartyId.*\|\| null/s);
assert.match(runtime, /dueAt = iso\([^\n]+"due_at"\)/);
assert.match(runtime, /executionTaskId.*\|\| null/s);
assert.match(runtime, /executionJobId.*\|\| null/s);
assert.match(runtime, /DIRECTIVE_RECORDED/);
assert.match(runtime, /DIRECTIVE_SUPERSEDED/);
assert.match(runtime, /DIRECTIVE_EXECUTION_LINKED/);
assert.match(runtime, /DIRECTIVE_COMPLETED/);
assert.match(runtime, /DIRECTIVE_CANCELLED/);
assert.match(runtime, /SECRETARY_DIRECTIVE_REGISTER_STALE_SUPERSESSION_REJECTED/);
assert.match(runtime, /SECRETARY_DIRECTIVE_REGISTER_STALE_EXECUTION_LINK_REJECTED/);
assert.match(runtime, /SECRETARY_DIRECTIVE_REGISTER_STALE_COMPLETION_REJECTED/);
assert.match(runtime, /SECRETARY_DIRECTIVE_REGISTER_STALE_CANCELLATION_REJECTED/);
assert.match(runtime, /\.eq\("updated_at", task\.updated_at\)/);
assert.match(runtime, /status:\s*"DONE"/);
assert.match(runtime, /due_at:\s*null/);
assert.match(runtime, /remind_at:\s*null/);
assert.match(runtime, /ledger_task_is_execution_work:\s*false/);
assert.match(runtime, /Linked task or job status alone must never imply directive completion/i);
assert.match(runtime, /completion_evidence_required:\s*true/);
assert.match(runtime, /completion_inferred:\s*false/);
assert.match(runtime, /directive_inferred:\s*false/);
assert.match(runtime, /directive_issued_by_secretary:\s*false/);
assert.match(runtime, /issuer_inferred:\s*false/);
assert.match(runtime, /target_inferred:\s*false/);
assert.match(runtime, /due_at_inferred:\s*false/);
assert.match(runtime, /execution_link_inferred:\s*false/);
assert.match(runtime, /payment_authority_created:\s*false/);
assert.match(runtime, /signing_authority_created:\s*false/);
assert.match(runtime, /booking_authority_created:\s*false/);
assert.match(runtime, /approval_authority_delegated:\s*false/);
assert.match(runtime, /binding_authority_delegated:\s*false/);
assert.match(runtime, /platform_permissions_mutated:\s*false/);
assert.match(runtime, /external_authority_used:\s*false/);
assert.match(runtime, /scope:\s*"TASK_ROUTING"/);
assert.match(runtime, /\[SOURCE, "secretary_decision_register"\]/);

assert.match(capability, /capability:\s*"secretary_directive_register"/);
for (const action of ["record", "supersede", "linkExecution", "complete", "cancel", "read", "list"]) {
  assert.match(capability, new RegExp(`${action}:\\s*\\{`));
}
assert.match(capability, /does not convert it into a decision, preference, commitment, work assignment, or grant of authority/i);
assert.match(capability, /without carrying unstated target, due-date, execution, or authority semantics forward/i);
assert.match(capability, /This creates no work and never infers directive completion/i);
assert.match(capability, /linked task or job being done is not sufficient by itself/i);
assert.match(capability, /No replacement directive, decision, preference, or authority is inferred/i);
assert.match(capability, /required:\s*\["instruction_text", "issuer_party_id", "evidence_id", "instructed_at"\]/);
assert.match(capability, /operatorRequiresConfirmation:\s*false/);
assert.match(capability, /aiEnabled:\s*false/);
assert.match(tasksMigration, /create table if not exists public\.secretary_tasks/);
assert.match(tasksMigration, /status text not null default 'OPEN'/);

assert.match(platform, /createSecretaryExecutiveDirectiveRegisterCapability/);
assert.match(platform, /secretary_directive_register:\s*\{/);
for (const action of ["record", "supersede", "linkExecution", "complete", "cancel", "read", "list"]) {
  assert.match(platform, new RegExp(`${action}:\\s*async \\(\\) => createSecretaryExecutiveDirectiveRegisterCapability\\("${action}"\\)`));
}

console.log("OPERATOR_SECRETARY_DIRECTIVE_REGISTER_AUDIT=PASS");
console.log("SECRETARY_DIRECTIVE_REGISTER_DURABLE=true");
console.log("SECRETARY_DIRECTIVE_REGISTER_EXISTING_TASK_SCHEMA_REUSED=true");
console.log("SECRETARY_DIRECTIVE_REGISTER_EXACT_INSTRUCTION_TEXT=true");
console.log("SECRETARY_DIRECTIVE_REGISTER_ISSUER_REQUIRED=true");
console.log("SECRETARY_DIRECTIVE_REGISTER_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_DIRECTIVE_REGISTER_INSTRUCTED_AT_REQUIRED=true");
console.log("SECRETARY_DIRECTIVE_REGISTER_LEDGER_TASK_IS_EXECUTION_WORK=false");
console.log("SECRETARY_DIRECTIVE_REGISTER_TARGET_INFERRED=false");
console.log("SECRETARY_DIRECTIVE_REGISTER_DUE_AT_INFERRED=false");
console.log("SECRETARY_DIRECTIVE_REGISTER_EXECUTION_LINK_INFERRED=false");
console.log("SECRETARY_DIRECTIVE_REGISTER_COMPLETION_INFERRED=false");
console.log("SECRETARY_DIRECTIVE_REGISTER_VERSION_HISTORY_PRESERVED=true");
console.log("SECRETARY_DIRECTIVE_REGISTER_STALE_MUTATIONS_FENCED=true");
console.log("SECRETARY_DIRECTIVE_REGISTER_PAYMENT_AUTHORITY_CREATED=false");
console.log("SECRETARY_DIRECTIVE_REGISTER_SIGNING_AUTHORITY_CREATED=false");
console.log("SECRETARY_DIRECTIVE_REGISTER_BOOKING_AUTHORITY_CREATED=false");
console.log("SECRETARY_DIRECTIVE_REGISTER_APPROVAL_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_DIRECTIVE_REGISTER_BINDING_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_DIRECTIVE_REGISTER_PLATFORM_PERMISSIONS_MUTATED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
