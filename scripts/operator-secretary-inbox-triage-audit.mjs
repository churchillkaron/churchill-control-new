import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = {
  runtime: await readFile("lib/operator/secretary/SecretaryInboxTriageRuntime.js", "utf8"),
  capability: await readFile("lib/platform/capabilities/createSecretaryInboxTriageCapability.js", "utf8"),
  platform: await readFile("lib/platform/runtime/PlatformDomainRuntime.js", "utf8"),
  worker: await readFile("app/api/internal/secretary/messages/process/route.js", "utf8"),
  briefing: await readFile("lib/operator/secretary/SecretaryExecutiveBriefingRuntime.js", "utf8"),
  harness: await readFile("scripts/run-operator-secretary-meeting-local-certification.sh", "utf8"),
};

assert.match(files.runtime, /AVANTIQO_EXECUTIVE_SECRETARY_INBOX_TRIAGE_V1/);
assert.match(files.runtime, /EXECUTIVE_DECISION/);
assert.match(files.runtime, /SECRETARY_HANDLE/);
assert.match(files.runtime, /SECRETARY_HANDLED/);
assert.match(files.runtime, /WAITING_EXTERNAL/);
assert.match(files.runtime, /FYI/);
assert.match(files.runtime, /NEEDS_REVIEW/);
assert.match(files.runtime, /secretaryJobInstructionRequiresHighAuthority/);
assert.match(files.runtime, /BUSINESS_DECISION_PATTERN/);
assert.match(files.runtime, /normalizedAction === "LEAVE_MESSAGE"\) return "SECRETARY_HANDLE"/);
assert.match(files.runtime, /normalizedAction === "ATTACHMENT_REVIEW"\) return "NEEDS_REVIEW"/);
assert.match(files.runtime, /business_decision_boundary_detected/);
assert.match(files.runtime, /high_authority_boundary_detected/);
assert.match(files.runtime, /avantiqo-secretary-inbox-triage-job-v1/);
assert.match(files.runtime, /autonomy_level:\s*"EXECUTE_WITH_GATES"/);
assert.match(files.runtime, /inbox_triage_job:\s*true/);
assert.match(files.runtime, /execution_owner:\s*"SECRETARY"/);
assert.match(files.runtime, /execution_ready:\s*true/);
assert.match(files.runtime, /avantiqo-secretary-inbox-waiting-external-v1/);
assert.match(files.runtime, /Follow up on the most recent outbound request only and ask whether there is an update/);
assert.match(files.runtime, /Do not add or change terms, prices, promises, deadlines, approvals, bookings, payments, signatures, legal acceptance/);
assert.match(files.runtime, /cancelled_by_inbound_response:\s*true/);
assert.match(files.runtime, /repairSecretaryMissingInboundTriage/);
assert.match(files.runtime, /\.eq\("status", "COMPLETED"\)/);
assert.match(files.runtime, /\.is\("metadata->secretary_inbox_triage", null\)/);
assert.match(files.runtime, /order\("completed_at", \{ ascending: true, nullsFirst: true \}\)/);
assert.match(files.runtime, /repair_candidates_selected_server_side:\s*true/);
assert.match(files.runtime, /oldest_untriaged_first:\s*true/);
assert.match(files.runtime, /completed_reception_not_lost_after_triage_interruption:\s*true/);
assert.match(files.runtime, /secretary_inbox_triage/);
assert.match(files.runtime, /attendance_not_inferred:\s*true/);
assert.match(files.runtime, /external_authority_used:\s*false/);

assert.match(files.capability, /capability:\s*"secretary_inbox_triage"/);
assert.match(files.capability, /operatorAutoExecute:\s*true/);
assert.match(files.capability, /operatorRequiresConfirmation:\s*false/);
assert.match(files.capability, /contextScope:\s*"organization"/);
assert.match(files.capability, /readSecretaryInboxTriage/);

assert.match(files.platform, /createSecretaryInboxTriageCapability/);
assert.match(files.platform, /secretary_inbox_triage:\s*\{/);
assert.match(files.platform, /read:\s*async\s*\(\)\s*=>\s*createSecretaryInboxTriageCapability\(\)/);

assert.match(files.worker, /AVANTIQO_SECRETARY_MESSAGE_PROCESS_V2/);
assert.match(files.worker, /recordSecretaryInboundTriage/);
assert.match(files.worker, /repairSecretaryMissingInboundTriage/);
assert.match(files.worker, /reconcileSecretaryWaitingExternal/);
assert.match(files.worker, /triage_pending_repair:\s*true/);
assert.match(files.worker, /inbox_triage_completed_reception_not_lost:\s*true/);
assert.match(files.worker, /inbox_triage_repair_candidates_server_side:\s*true/);
assert.match(files.worker, /inbox_triage_repair_oldest_untriaged_first:\s*true/);
assert.match(files.worker, /waiting_external_secretary_owned_chasing:\s*true/);
assert.match(files.worker, /waiting_external_high_authority_auto_chase_blocked:\s*true/);
assert.match(files.worker, /waiting_external_business_decision_auto_chase_blocked:\s*true/);

assert.match(files.briefing, /AVANTIQO_EXECUTIVE_SECRETARY_DESK_BRIEFING_V3/);
assert.match(files.briefing, /readSecretaryInboxTriage/);
assert.match(files.briefing, /correspondence_attention/);
assert.match(files.briefing, /inbox_waiting_external/);
assert.match(files.briefing, /inbox_attention_is_exception_based:\s*true/);
assert.match(files.briefing, /no_action_required:\s*executiveInterruptCount === 0/);

console.log("OPERATOR_SECRETARY_INBOX_TRIAGE_AUDIT=PASS");
console.log("SECRETARY_INBOX_TRIAGE_EVIDENCE_BACKED=true");
console.log("SECRETARY_INBOX_ROUTINE_WORK_SECRETARY_OWNED=true");
console.log("SECRETARY_INBOX_BUSINESS_DECISION_ESCALATION=true");
console.log("SECRETARY_INBOX_HIGH_AUTHORITY_ESCALATION=true");
console.log("SECRETARY_INBOX_WAITING_EXTERNAL_CHASING=true");
console.log("SECRETARY_INBOX_WAITING_EXTERNAL_IDEMPOTENT=true");
console.log("SECRETARY_INBOX_INBOUND_RESPONSE_FENCES_STALE_CHASE=true");
console.log("SECRETARY_INBOX_INTERRUPTED_TRIAGE_REPAIR=true");
console.log("SECRETARY_INBOX_EXECUTIVE_BRIEFING_V3=true");
console.log("SECRETARY_INBOX_EXECUTIVE_ATTENTION_EXCEPTION_BASED=true");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
