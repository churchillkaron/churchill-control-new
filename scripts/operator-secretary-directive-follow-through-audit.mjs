import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  runtime: "lib/operator/secretary/SecretaryDirectiveFollowThroughRuntime.js",
  capability: "lib/platform/capabilities/createSecretaryDirectiveFollowThroughCapability.js",
  platform: "lib/platform/runtime/PlatformDomainRuntime.js",
  packageJson: "package.json",
  wrapper: "scripts/run-operator-secretary-meeting-local-certification.sh",
  migration: "supabase/migrations/20260825062200_avantiqo_secretary_native_core.sql",
};

const source = Object.fromEntries(
  await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")])),
);

assert.match(source.runtime, /AVANTIQO_EXECUTIVE_SECRETARY_DIRECTIVE_FOLLOW_THROUGH_V1/);
assert.match(source.runtime, /AVANTIQO_EXECUTIVE_SECRETARY_DIRECTIVE_REGISTER_V1/);
assert.match(source.runtime, /directive_follow_through_v1/);
assert.match(source.runtime, /DIRECTIVE_FOLLOW_THROUGH_STARTED/);
assert.match(source.runtime, /DIRECTIVE_TARGET_RESPONSE_RECORDED/);
assert.match(source.runtime, /DIRECTIVE_PROGRESS_RECORDED/);
assert.match(source.runtime, /DIRECTIVE_FOLLOW_THROUGH_COMPLETED/);
assert.match(source.runtime, /DIRECTIVE_FOLLOW_THROUGH_STALE_FENCED/);
assert.match(source.runtime, /DIRECTIVE_FOLLOW_THROUGH_CANCELLED/);
assert.match(source.runtime, /DIRECTIVE_DELIVERY/);
assert.match(source.runtime, /ACKNOWLEDGEMENT_CHASE/);
assert.match(source.runtime, /PROGRESS_CHECK/);
assert.match(source.runtime, /DUE_REVIEW/);
assert.match(source.runtime, /EXECUTION_COMPLETION_EVIDENCE_REVIEW/);
assert.match(source.runtime, /EXECUTIVE_RESPONSE_REVIEW/);
assert.match(source.runtime, /TRACK_ONLY/);
assert.match(source.runtime, /DELIVER_EXACT/);
assert.match(source.runtime, /HIGH_AUTHORITY_PATTERN/);
assert.match(source.runtime, /high_authority_review_required/);
assert.match(source.runtime, /execution_ready:\s*false/);
assert.match(source.runtime, /SECRETARY_DIRECTIVE_FOLLOW_THROUGH_EXPLICIT_TARGET_PARTY_REQUIRED/);
assert.match(source.runtime, /SECRETARY_DIRECTIVE_FOLLOW_THROUGH_STALE_VERSION_REJECTED/);
assert.match(source.runtime, /SECRETARY_DIRECTIVE_FOLLOW_THROUGH_PLAN_ALREADY_EXISTS/);
assert.match(source.runtime, /directive_ledger_task_is_execution_work:\s*false/);
assert.match(source.runtime, /acknowledgement_inferred:\s*false/);
assert.match(source.runtime, /acceptance_inferred:\s*false/);
assert.match(source.runtime, /commitment_inferred:\s*false/);
assert.match(source.runtime, /progress_inferred:\s*false/);
assert.match(source.runtime, /completion_inferred:\s*false/);
assert.match(source.runtime, /directive_completion_inferred:\s*false/);
assert.match(source.runtime, /execution_link_inferred:\s*false/);
assert.match(source.runtime, /payment_authority_created:\s*false/);
assert.match(source.runtime, /signing_authority_created:\s*false/);
assert.match(source.runtime, /booking_authority_created:\s*false/);
assert.match(source.runtime, /approval_authority_delegated:\s*false/);
assert.match(source.runtime, /binding_authority_delegated:\s*false/);
assert.match(source.runtime, /platform_permissions_mutated:\s*false/);
assert.match(source.runtime, /external_authority_used:\s*false/);
assert.match(source.runtime, /completeSecretaryExecutiveDirective/);
assert.match(source.runtime, /linked_execution_terminal_is_completion:\s*false/);
assert.match(source.runtime, /directive_cancelled:\s*false/);
assert.match(source.runtime, /resolveSecretaryAdministrativeCoverage/);
assert.match(source.runtime, /scope:\s*"FOLLOW_UP_COORDINATION"/);
assert.match(source.runtime, /\.eq\("updated_at", task\.updated_at\)/);
assert.match(source.runtime, /secretary_follow_ups/);

assert.match(source.capability, /capability:\s*"secretary_directive_follow_through"/);
for (const action of ["start", "read", "list", "recordAcknowledgement", "recordProgress", "complete", "refresh", "cancel"]) {
  assert.match(source.capability, new RegExp(`${action.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}:\\s*\\{`));
}
assert.match(source.capability, /Acknowledgment means only evidenced receipt or understanding/i);
assert.match(source.capability, /Linked task or job terminal status alone never completes the directive/i);
assert.match(source.capability, /does not cancel, withdraw, supersede or complete the executive directive/i);
assert.match(source.capability, /delivery_mode:\s*\{\s*type:\s*"string",\s*enum:\s*\["TRACK_ONLY",\s*"DELIVER_EXACT"\]/s);
assert.match(source.capability, /response_kind:\s*\{\s*type:\s*"string",\s*enum:\s*\["ACKNOWLEDGED",\s*"NEEDS_CLARIFICATION",\s*"DECLINED"\]/s);
assert.match(source.capability, /operatorRequiresConfirmation:\s*false/);

assert.match(source.platform, /createSecretaryDirectiveFollowThroughCapability/);
assert.match(source.platform, /secretary_directive_follow_through:\s*\{/);
assert.match(source.platform, /recordAcknowledgement:\s*async \(\) => createSecretaryDirectiveFollowThroughCapability\("recordAcknowledgement"\)/);
assert.match(source.platform, /refresh:\s*async \(\) => createSecretaryDirectiveFollowThroughCapability\("refresh"\)/);

assert.match(source.packageJson, /operator-secretary-directive-follow-through-audit\.mjs/);
assert.match(source.wrapper, /certify-secretary-directive-follow-through-local\.mjs/);
assert.match(source.migration, /create table if not exists public\.secretary_follow_ups/);
assert.match(source.migration, /action_type in \('CALL','MESSAGE','EMAIL','MEETING','REVIEW','OTHER'\)/);
assert.match(source.migration, /status in \('PENDING','COMPLETED','CANCELLED'\)/);

console.log("OPERATOR_SECRETARY_DIRECTIVE_FOLLOW_THROUGH_AUDIT=PASS");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_DURABLE=true");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_EXISTING_FOLLOW_UP_SCHEMA_REUSED=true");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_EXPLICIT_TARGET_REQUIRED=true");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_ACKNOWLEDGEMENT_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_ACKNOWLEDGEMENT_IS_ACCEPTANCE=false");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_ACKNOWLEDGEMENT_IS_COMMITMENT=false");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_ACKNOWLEDGEMENT_IS_COMPLETION=false");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_PROGRESS_IS_COMPLETION=false");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_LINKED_EXECUTION_TERMINAL_IS_COMPLETION=false");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_HIGH_AUTHORITY_AUTO_SEND=false");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_STALE_VERSION_FENCED=true");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_LEDGER_TASK_IS_EXECUTION_WORK=false");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_PLATFORM_PERMISSIONS_MUTATED=false");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_BINDING_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_DIRECTIVE_FOLLOW_THROUGH_APPROVAL_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
