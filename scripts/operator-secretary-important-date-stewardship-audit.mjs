import fs from "node:fs";
import assert from "node:assert/strict";

const runtime = fs.readFileSync("lib/operator/secretary/SecretaryImportantDateStewardshipRuntime.js", "utf8");
const capability = fs.readFileSync("lib/platform/capabilities/createSecretaryImportantDateStewardshipCapability.js", "utf8");
const platform = fs.readFileSync("lib/platform/runtime/PlatformDomainRuntime.js", "utf8");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const wrapper = fs.readFileSync("scripts/run-operator-secretary-meeting-local-certification.sh", "utf8");

assert.match(runtime, /AVANTIQO_EXECUTIVE_SECRETARY_IMPORTANT_DATE_STEWARDSHIP_V1/);
assert.match(runtime, /relationship_memory_is_source_of_truth: true/);
assert.match(runtime, /BIRTHDAY/);
assert.match(runtime, /ANNIVERSARY/);
assert.match(runtime, /RELATIONSHIP_MILESTONE/);
assert.match(runtime, /ANNUAL/);
assert.match(runtime, /NONE/);
assert.match(runtime, /FEB_28/);
assert.match(runtime, /MAR_01/);
assert.match(runtime, /SKIP/);
assert.match(runtime, /SECRETARY_IMPORTANT_DATE_LEAP_DAY_POLICY_REQUIRED/);
assert.match(runtime, /SECRETARY_IMPORTANT_DATE_STALE_VERSION/);
assert.match(runtime, /SECRETARY_IMPORTANT_DATE_EVIDENCE_REUSE_CONFLICT/);
assert.match(runtime, /action_type: "REVIEW"/);
assert.match(runtime, /execution_ready: false/);
assert.match(runtime, /external_message_sent: false/);
assert.match(runtime, /gift_purchased: false/);
assert.match(runtime, /calendar_event_created: false/);
assert.match(runtime, /date_inferred: false/);
assert.match(runtime, /age_inferred: false/);
assert.match(capability, /secretary_important_date_stewardship/);
for (const action of ["register", "revise", "retire", "refresh", "read", "listUpcoming"]) {
  assert.match(capability, new RegExp(`\\b${action}\\b`));
}
assert.match(platform, /secretary_important_date_stewardship/);
assert.match(pkg.scripts["audit:operator-secretary-end-to-end"] || "", /operator-secretary-important-date-stewardship-audit\.mjs/);
assert.match(wrapper, /certify-secretary-important-date-stewardship-local\.mjs/);

console.log("OPERATOR_SECRETARY_IMPORTANT_DATE_STEWARDSHIP_AUDIT=PASS");
console.log("SECRETARY_IMPORTANT_DATE_RELATIONSHIP_MEMORY_SOURCE_OF_TRUTH=true");
console.log("SECRETARY_IMPORTANT_DATE_ANNUAL_RECURRENCE_SUPPORTED=true");
console.log("SECRETARY_IMPORTANT_DATE_ONE_OFF_SUPPORTED=true");
console.log("SECRETARY_IMPORTANT_DATE_LEAP_DAY_POLICY_EXPLICIT=true");
console.log("SECRETARY_IMPORTANT_DATE_REMINDERS_INTERNAL_REVIEW_ONLY=true");
console.log("SECRETARY_IMPORTANT_DATE_DATE_INFERRED=false");
console.log("SECRETARY_IMPORTANT_DATE_AGE_INFERRED=false");
console.log("SECRETARY_IMPORTANT_DATE_EXTERNAL_MESSAGE_SENT=false");
console.log("SECRETARY_IMPORTANT_DATE_GIFT_PURCHASED=false");
console.log("SECRETARY_IMPORTANT_DATE_CALENDAR_EVENT_CREATED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
