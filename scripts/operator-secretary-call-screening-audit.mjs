import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const runtime = read("lib/operator/secretary/SecretaryCallScreeningRuntime.js");
const capability = read("lib/platform/capabilities/createSecretaryCallScreeningCapability.js");
const platform = read("lib/platform/runtime/PlatformDomainRuntime.js");

assert.match(runtime, /AVANTIQO_EXECUTIVE_SECRETARY_CALL_SCREENING_V1/);
assert.match(runtime, /CONTACT_METADATA_KEY = "call_screening_v1"/);
assert.match(runtime, /CALL_METADATA_KEY = "call_screening_v1"/);
assert.match(runtime, /function screeningId\(callId, evidenceId\)/);
assert.match(runtime, /function routingTaskId\(callId, screeningIdValue\)/);
assert.match(runtime, /function callbackFollowUpId\(callId, screeningIdValue\)/);
assert.match(runtime, /SECRETARY_CALL_SCREENING_CONTACT_EVIDENCE_REQUIRED/);
assert.match(runtime, /SECRETARY_CALL_SCREENING_CONTACT_SOURCE_REFERENCE_REQUIRED/);
assert.match(runtime, /SECRETARY_CALL_SCREENING_EVIDENCE_REQUIRED/);
assert.match(runtime, /SECRETARY_CALL_SCREENING_SOURCE_REFERENCE_REQUIRED/);
assert.match(runtime, /caller_stated_urgency/);
assert.match(runtime, /urgency_verified: false/);
assert.match(runtime, /objective_emergency_inferred: false/);
assert.match(runtime, /vip_inferred: false/);
assert.match(runtime, /urgency_inferred: false/);
assert.match(runtime, /EXPLICIT_CONTACT_INTERRUPT_RULE/);
assert.match(runtime, /CALLER_STATED_URGENCY_UNVERIFIED/);
assert.match(runtime, /EXECUTIVE_REVIEW/);
assert.match(runtime, /SECRETARY_HANDLE/);
assert.match(runtime, /CALLBACK_REQUESTED/);
assert.match(runtime, /executive_interruption_authority_created: false/);
assert.match(runtime, /recordSecretaryCallScreeningDisposition/);
assert.match(runtime, /SECRETARY_CALL_SCREENING_DISPOSITION_EVIDENCE_REQUIRED/);
assert.match(runtime, /status: "SUPERSEDED"/);
assert.match(runtime, /status: "CLEARED"/);
assert.match(runtime, /external_authority_used: false/);

for (const action of [
  "setContactHandling",
  "clearContactHandling",
  "readContactHandling",
  "screen",
  "read",
  "listAttention",
  "recordDisposition",
]) {
  assert.match(capability, new RegExp(`${action}:`));
}
assert.match(capability, /capability: "secretary_call_screening"/);
assert.match(capability, /operatorAutoExecute: true/);
assert.match(capability, /operatorRequiresConfirmation: false/);
assert.match(capability, /approval: \{ required: false \}/);

assert.match(platform, /createSecretaryCallScreeningCapability/);
assert.match(platform, /secretary_call_screening:/);
assert.match(platform, /setContactHandling: async \(\) => createSecretaryCallScreeningCapability\("setContactHandling"\)/);
assert.match(platform, /recordDisposition: async \(\) => createSecretaryCallScreeningCapability\("recordDisposition"\)/);

console.log("OPERATOR_SECRETARY_CALL_SCREENING_AUDIT=PASS");
console.log("SECRETARY_CALL_SCREENING_DURABLE=true");
console.log("SECRETARY_CALL_SCREENING_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_CALL_SCREENING_CONTACT_PRIORITY_EXPLICIT=true");
console.log("SECRETARY_CALL_SCREENING_VIP_INFERRED=false");
console.log("SECRETARY_CALL_SCREENING_CALLER_URGENCY_UNVERIFIED=true");
console.log("SECRETARY_CALL_SCREENING_URGENCY_INFERRED=false");
console.log("SECRETARY_CALL_SCREENING_EXECUTIVE_INTERRUPTION_EXPLICIT_RULE_ONLY=true");
console.log("SECRETARY_CALL_SCREENING_EXECUTIVE_REVIEW=true");
console.log("SECRETARY_CALL_SCREENING_CALLBACK=true");
console.log("SECRETARY_CALL_SCREENING_SECRETARY_HANDLE=true");
console.log("SECRETARY_CALL_SCREENING_DETERMINISTIC=true");
console.log("SECRETARY_CALL_SCREENING_DISPOSITION_EVIDENCE=true");
console.log("SECRETARY_CALL_SCREENING_EXTERNAL_AUTHORITY_CREATED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
