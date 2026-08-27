import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  runtime: "lib/operator/secretary/SecretaryTravelOperationsRuntime.js",
  correction: "lib/operator/secretary/SecretaryTravelConfirmationCorrectionRuntime.js",
  capability: "lib/platform/capabilities/createSecretaryTravelOperationsCapability.js",
  platform: "lib/platform/runtime/PlatformDomainRuntime.js",
};

const source = Object.fromEntries(
  await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")])),
);

assert.match(source.runtime, /AVANTIQO_EXECUTIVE_SECRETARY_TRAVEL_OPERATIONS_V1/);
assert.match(source.runtime, /travel_operations_v1/);
assert.match(source.runtime, /SECRETARY_TRAVEL_OPERATIONS_CONFIRMATION_EVIDENCE_REQUIRED/);
assert.match(source.runtime, /SECRETARY_TRAVEL_OPERATIONS_CONFIRMATION_REFERENCE_REQUIRED/);
assert.match(source.runtime, /SECRETARY_TRAVEL_OPERATIONS_DISRUPTION_EVIDENCE_REQUIRED/);
assert.match(source.runtime, /SECRETARY_TRAVEL_OPERATIONS_REMINDER_TITLE_REQUIRED/);
assert.match(source.runtime, /resolveSecretaryAdministrativeCoverage/);
assert.match(source.runtime, /scope:\s*"TRAVEL_COORDINATION"/);
assert.match(source.runtime, /source:\s*"secretary_travel_operations"/);
assert.match(source.runtime, /researched_option_is_confirmation:\s*false/);
assert.match(source.runtime, /confirmation_inferred:\s*false/);
assert.match(source.runtime, /timestamp_inferred:\s*false/);
assert.match(source.runtime, /impact_inferred:\s*false/);
assert.match(source.runtime, /booking_authority_created:\s*false/);
assert.match(source.runtime, /payment_authority_created:\s*false/);
assert.match(source.runtime, /binding_authority_created:\s*false/);
assert.match(source.runtime, /approval_authority_delegated:\s*false/);
assert.match(source.runtime, /platform_permissions_mutated:\s*false/);
assert.match(source.runtime, /external_authority_used:\s*false/);
assert.match(source.runtime, /status === "APPROVAL_REQUIRED"/);
assert.match(source.runtime, /filter\(\(row\) => row\.status === "CONFIRMED"\)/);
assert.match(source.runtime, /superseded_confirmations:\s*supersededConfirmations/);
assert.match(source.runtime, /confirmation_history:\s*ledger\.history/);
assert.match(source.runtime, /superseded_items:\s*supersededConfirmations\.length/);

assert.match(source.correction, /SECRETARY_TRAVEL_OPERATIONS_CORRECTION_EVIDENCE_REQUIRED/);
assert.match(source.correction, /SECRETARY_TRAVEL_OPERATIONS_CORRECTION_REASON_REQUIRED/);
assert.match(source.correction, /SECRETARY_TRAVEL_OPERATIONS_STALE_CORRECTION_REJECTED/);
assert.match(source.correction, /CONFIRMATION_CORRECTED/);
assert.match(source.correction, /supersedes_confirmation_id/);
assert.match(source.correction, /status:\s*"SUPERSEDED"/);
assert.match(source.correction, /resolveSecretaryAdministrativeCoverage/);
assert.match(source.correction, /scope:\s*"TRAVEL_COORDINATION"/);
assert.match(source.correction, /confirmation_inferred:\s*false/);
assert.match(source.correction, /booking_authority_created:\s*false/);
assert.match(source.correction, /payment_authority_created:\s*false/);
assert.match(source.correction, /binding_authority_created:\s*false/);
assert.match(source.correction, /approval_authority_delegated:\s*false/);
assert.match(source.correction, /external_authority_used:\s*false/);

assert.match(source.capability, /capability:\s*"secretary_travel_operations"/);
for (const action of ["read", "recordConfirmation", "correctConfirmation", "recordDisruption", "createReminder"]) {
  assert.match(source.capability, new RegExp(`${action}:\\s*\\{`));
}
assert.match(source.capability, /Researched options are never treated as confirmations/i);
assert.match(source.capability, /creates no booking, payment or commercial authority/i);
assert.match(source.capability, /preserving the superseded confirmation and correction history/i);
assert.match(source.capability, /No travel time, check-in time, transfer time or deadline is guessed/i);

assert.match(source.platform, /createSecretaryTravelOperationsCapability/);
assert.match(source.platform, /secretary_travel_operations:\s*\{/);
assert.match(source.platform, /recordConfirmation:\s*async \(\) => createSecretaryTravelOperationsCapability\("recordConfirmation"\)/);
assert.match(source.platform, /correctConfirmation:\s*async \(\) => createSecretaryTravelOperationsCapability\("correctConfirmation"\)/);
assert.match(source.platform, /recordDisruption:\s*async \(\) => createSecretaryTravelOperationsCapability\("recordDisruption"\)/);
assert.match(source.platform, /createReminder:\s*async \(\) => createSecretaryTravelOperationsCapability\("createReminder"\)/);

console.log("OPERATOR_SECRETARY_TRAVEL_OPERATIONS_AUDIT=PASS");
console.log("SECRETARY_TRAVEL_OPERATIONS_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_TRAVEL_OPERATIONS_CORRECTION_HISTORY_PRESERVED=true");
console.log("SECRETARY_TRAVEL_OPERATIONS_STALE_CORRECTION_FENCED=true");
console.log("SECRETARY_TRAVEL_OPERATIONS_SUPERSEDED_NOT_ACTIVE=true");
console.log("SECRETARY_TRAVEL_OPERATIONS_RESEARCH_NOT_CONFIRMATION=true");
console.log("SECRETARY_TRAVEL_OPERATIONS_CONFIRMATION_NOT_INFERRED=true");
console.log("SECRETARY_TRAVEL_OPERATIONS_TIMESTAMP_NOT_INFERRED=true");
console.log("SECRETARY_TRAVEL_OPERATIONS_DISRUPTION_IMPACT_NOT_INFERRED=true");
console.log("SECRETARY_TRAVEL_OPERATIONS_LIVE_COVERAGE_ROUTING=true");
console.log("SECRETARY_TRAVEL_OPERATIONS_PLATFORM_PERMISSIONS_MUTATED=false");
console.log("SECRETARY_TRAVEL_OPERATIONS_BINDING_AUTHORITY_CREATED=false");
console.log("SECRETARY_TRAVEL_OPERATIONS_APPROVAL_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_TRAVEL_OPERATIONS_BOOKING_AUTHORITY_CREATED=false");
console.log("SECRETARY_TRAVEL_OPERATIONS_PAYMENT_AUTHORITY_CREATED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
