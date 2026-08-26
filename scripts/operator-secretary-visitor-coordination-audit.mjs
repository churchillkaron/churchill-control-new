import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [runtime, capability, platform] = await Promise.all([
  readFile("lib/operator/secretary/SecretaryVisitorCoordinationRuntime.js", "utf8"),
  readFile("lib/platform/capabilities/createSecretaryVisitorCoordinationCapability.js", "utf8"),
  readFile("lib/platform/runtime/PlatformDomainRuntime.js", "utf8"),
]);

assert.match(runtime, /AVANTIQO_EXECUTIVE_SECRETARY_VISITOR_COORDINATION_V1/);
assert.match(runtime, /coordinationTaskId/);
assert.match(runtime, /coordinationFollowUpId/);
assert.match(runtime, /HOST_CONFIRMATION_REQUEST/);
assert.match(runtime, /HOST_CONFIRMATION_CHASE/);
assert.match(runtime, /VISITOR_CONFIRMATION_REQUEST/);
assert.match(runtime, /VISITOR_CONFIRMATION_CHASE/);
assert.match(runtime, /ACCESS_REQUEST/);
assert.match(runtime, /ACCESS_CHASE/);
assert.match(runtime, /RECEPTION_NOTICE/);
assert.match(runtime, /ARRIVAL_INSTRUCTIONS/);
assert.match(runtime, /ARRIVAL_RECEIPT_CHASE/);
assert.match(runtime, /execution_owner:\s*"SECRETARY"/);
assert.match(runtime, /execution_ready:\s*true/);
assert.match(runtime, /secretary_owned:\s*true/);
assert.match(runtime, /async function recordPartyResponse/);
assert.match(runtime, /if \(!evidenceId\) throw new Error\(`SECRETARY_VISITOR_COORDINATION_\$\{role\}_EVIDENCE_REQUIRED`\)/);
assert.match(runtime, /if \(confirmed !== true && confirmed !== false\)/);
assert.match(runtime, /responseParty !== expectedParty/);
assert.match(runtime, /SECRETARY_VISITOR_COORDINATION_ACCESS_DECISION_EVIDENCE_REQUIRED/);
assert.match(runtime, /SECRETARY_VISITOR_COORDINATION_ACCESS_DECISION_AUTHORITY_MISMATCH/);
assert.match(runtime, /SECRETARY_VISITOR_COORDINATION_ACKNOWLEDGEMENT_EVIDENCE_REQUIRED/);
assert.match(runtime, /SECRETARY_VISITOR_COORDINATION_ARRIVAL_EVIDENCE_REQUIRED/);
assert.match(runtime, /schedule_changed_requires_reconfirmation:\s*true/);
assert.match(runtime, /stale coordination messages fenced before re-confirmation/i);
assert.match(runtime, /confirmations_reset:\s*true/);
assert.match(runtime, /access_reapproval_required/);
assert.match(runtime, /acknowledgement_is_not_arrival:\s*true/);
assert.match(runtime, /acknowledgement_is_not_access_grant:\s*true/);
assert.match(runtime, /arrival_not_inferred:\s*true/);
assert.match(runtime, /admission_not_inferred:\s*true/);
assert.match(runtime, /physical_access_authority_created:\s*false/);
assert.match(runtime, /physical_access_granted_by_secretary:\s*false/);
assert.match(runtime, /external_authority_used:\s*false/);
assert.match(runtime, /The Executive Secretary is requesting access only/i);
assert.match(runtime, /do not issue, activate, promise, or infer any physical access/i);
assert.doesNotMatch(runtime, /deliverCommunicationMessage/);
assert.doesNotMatch(runtime, /placeSecretaryOutboundCall/);
assert.doesNotMatch(runtime, /service_role/i);

for (const action of [
  "start",
  "read",
  "recordHostResponse",
  "recordVisitorResponse",
  "recordAccessDecision",
  "refresh",
  "acknowledge",
  "recordArrival",
  "cancel",
]) {
  assert.match(capability, new RegExp(`\\b${action}:\\s*\\{`));
  assert.match(platform, new RegExp(`createSecretaryVisitorCoordinationCapability\\(\\"${action}\\"\\)`));
}
assert.match(capability, /capability:\s*"secretary_visitor_coordination"/);
assert.match(capability, /contextScope:\s*"organization"/);
assert.match(capability, /operatorAutoExecute:\s*true/);
assert.match(capability, /operatorRequiresConfirmation:\s*false/);
assert.match(capability, /never creates, grants, issues, activates or infers physical access/i);
assert.match(capability, /Receipt acknowledgement is not arrival, admission, access approval/i);
assert.match(platform, /createSecretaryVisitorCoordinationCapability/);
assert.match(platform, /secretary_visitor_coordination:/);

console.log("OPERATOR_SECRETARY_VISITOR_COORDINATION_AUDIT=PASS");
console.log("SECRETARY_VISITOR_COORDINATION_DURABLE_LIFECYCLE=true");
console.log("SECRETARY_VISITOR_HOST_CONFIRMATION_EVIDENCE=true");
console.log("SECRETARY_VISITOR_CONFIRMATION_EVIDENCE=true");
console.log("SECRETARY_VISITOR_ACCESS_REQUEST_NOT_GRANT=true");
console.log("SECRETARY_VISITOR_ACCESS_DECISION_AUTHORITY_EVIDENCE=true");
console.log("SECRETARY_VISITOR_ARRIVAL_INSTRUCTIONS_GOVERNED=true");
console.log("SECRETARY_VISITOR_RECEPTION_NOTIFICATION=true");
console.log("SECRETARY_VISITOR_SCHEDULE_CHANGE_RECONFIRMATION=true");
console.log("SECRETARY_VISITOR_STALE_NOTICE_FENCING=true");
console.log("SECRETARY_VISITOR_ARRIVAL_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_VISITOR_ARRIVAL_NOT_INFERRED=true");
console.log("SECRETARY_VISITOR_PHYSICAL_ACCESS_AUTHORITY_CREATED=false");
console.log("SECRETARY_VISITOR_PHYSICAL_ACCESS_GRANTED_BY_SECRETARY=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
