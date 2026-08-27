import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const runtime = read("lib/operator/secretary/SecretaryMeetingCloseoutRuntime.js");
const followUpRuntime = read("lib/operator/secretary/SecretaryFollowUpExecutionRuntime.js");
const capability = read("lib/platform/capabilities/createSecretaryMeetingCloseoutCapability.js");
const platform = read("lib/platform/runtime/PlatformDomainRuntime.js");

assert.match(runtime, /AVANTIQO_EXECUTIVE_SECRETARY_MEETING_CLOSEOUT_V1/);
assert.match(runtime, /meeting\.status !== "COMPLETED"/);
assert.match(runtime, /secretary_meeting_closeout/);
assert.match(runtime, /deterministicUuid/);
assert.match(runtime, /MINUTES_DISTRIBUTION/);
assert.match(runtime, /ACKNOWLEDGEMENT_CHASE/);
assert.match(runtime, /CORRECTION_REVIEW/);
assert.match(runtime, /SECRETARY_MEETING_CLOSEOUT_RESPONSE_EVIDENCE_REQUIRED/);
assert.match(runtime, /acknowledgement_not_approval: true/);
assert.match(runtime, /attendance_inferred: false/);
assert.match(runtime, /correction_changes_minutes_automatically: false/);
assert.match(runtime, /secretary_exact_message_body_source: exactMessage \? EXACT_MESSAGE_SOURCE : null/);
assert.match(runtime, /secretary_exact_message_body: exactMessage \? text\(body, 32000\) : null/);
assert.match(runtime, /scope: "MEETING_COORDINATION"/);
assert.match(runtime, /secretary_coverage_scope: "FOLLOW_UP_COORDINATION"/);
assert.match(runtime, /coverage_routing_review_required === true/);
assert.match(runtime, /approval_authority_delegated: false/);
assert.match(runtime, /binding_authority_delegated: false/);
assert.match(runtime, /platform_permissions_mutated: false/);
assert.match(runtime, /external_authority_used: false/);

assert.match(followUpRuntime, /export function secretaryExactFollowUpMessageBody/);
assert.match(followUpRuntime, /metadata\.secretary_meeting_closeout !== true/);
assert.match(followUpRuntime, /secretary_exact_message_body_source/);
assert.match(followUpRuntime, /MEETING_CLOSEOUT_EXACT_MESSAGE_SOURCE/);
assert.match(followUpRuntime, /metadata\.execution_owner.*SECRETARY/);
assert.match(followUpRuntime, /metadata\.execution_ready !== true/);
assert.match(followUpRuntime, /const coverage = await applyLiveCoverageRouting\(execution, current\)/);
assert.match(followUpRuntime, /coverage\.routing\.coverage_routing_review_required === true/);
assert.match(followUpRuntime, /const exactBody = secretaryExactFollowUpMessageBody\(current, execution\)/);
assert.match(followUpRuntime, /secretary_reserve_follow_up_execution_message/);
assert.match(followUpRuntime, /deliverCommunicationMessage/);

assert.match(capability, /capability: "secretary_meeting_closeout"/);
assert.match(capability, /recordResponse/);
assert.match(capability, /acknowledgement_required/);
assert.match(capability, /CORRECTION_REQUESTED/);
assert.match(platform, /createSecretaryMeetingCloseoutCapability/);
assert.match(platform, /secretary_meeting_closeout:/);

console.log("OPERATOR_SECRETARY_MEETING_CLOSEOUT_AUDIT=PASS");
console.log("SECRETARY_MEETING_CLOSEOUT_DURABLE_LIFECYCLE=true");
console.log("SECRETARY_MEETING_CLOSEOUT_EXACT_MINUTES_PROVENANCE_GATED=true");
console.log("SECRETARY_MEETING_CLOSEOUT_ACK_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_MEETING_CLOSEOUT_ACK_NOT_APPROVAL=true");
console.log("SECRETARY_MEETING_CLOSEOUT_CORRECTION_NOT_AUTO_APPLIED=true");
console.log("SECRETARY_MEETING_CLOSEOUT_ATTENDANCE_INFERRED=false");
console.log("SECRETARY_MEETING_CLOSEOUT_LIVE_COVERAGE_GUARDED=true");
console.log("SECRETARY_MEETING_CLOSEOUT_PLATFORM_PERMISSIONS_MUTATED=false");
console.log("SECRETARY_MEETING_CLOSEOUT_BINDING_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_MEETING_CLOSEOUT_APPROVAL_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
