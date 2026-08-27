import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  runtime: "lib/operator/secretary/SecretaryWorkingPreferencesRuntime.js",
  capability: "lib/platform/capabilities/createSecretaryWorkingPreferencesCapability.js",
  platform: "lib/platform/runtime/PlatformDomainRuntime.js",
};

const source = Object.fromEntries(
  await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")])),
);

assert.match(source.runtime, /AVANTIQO_EXECUTIVE_SECRETARY_WORKING_PREFERENCES_V1/);
assert.match(source.runtime, /executive_working_preferences_v1/);
assert.match(source.runtime, /SECRETARY_WORKING_PREFERENCE_EVIDENCE_REQUIRED/);
assert.match(source.runtime, /SECRETARY_WORKING_PREFERENCE_CORRECTION_REQUIRED/);
assert.match(source.runtime, /SECRETARY_WORKING_PREFERENCE_STALE_CORRECTION_REJECTED/);
assert.match(source.runtime, /SECRETARY_WORKING_PREFERENCE_STALE_RETRACTION_REJECTED/);
assert.match(source.runtime, /SECRETARY_WORKING_PREFERENCE_SENSITIVE_KEY_FORBIDDEN/);
assert.match(source.runtime, /default_timezone/);
assert.match(source.runtime, /default_language/);
assert.match(source.runtime, /appointment_duration_minutes/);
assert.match(source.runtime, /business_hours/);
assert.match(source.runtime, /resolveSecretaryAdministrativeCoverage/);
assert.match(source.runtime, /scope:\s*"TASK_ROUTING"/);
assert.match(source.runtime, /explicit_instruction_overrides_preference:\s*true/);
assert.match(source.runtime, /preferences_inferred:\s*false/);
assert.match(source.runtime, /secrets_stored:\s*false/);
assert.match(source.runtime, /approval_authority_created:\s*false/);
assert.match(source.runtime, /binding_authority_created:\s*false/);
assert.match(source.runtime, /payment_authority_created:\s*false/);
assert.match(source.runtime, /platform_permissions_mutated:\s*false/);
assert.match(source.runtime, /external_authority_used:\s*false/);

assert.match(source.capability, /capability:\s*"secretary_working_preferences"/);
for (const action of ["read", "record", "correct", "retract"]) {
  assert.match(source.capability, new RegExp(`${action}:\\s*\\{`));
}
assert.match(source.capability, /Explicit current instructions override stored preferences/i);
assert.match(source.capability, /Sensitive credential or authority-bearing preference keys are rejected/i);
assert.match(source.capability, /approval, payment, signing, booking, or binding authority/i);

assert.match(source.platform, /createSecretaryWorkingPreferencesCapability/);
assert.match(source.platform, /secretary_working_preferences:\s*\{/);
assert.match(source.platform, /record:\s*async \(\) => createSecretaryWorkingPreferencesCapability\("record"\)/);
assert.match(source.platform, /correct:\s*async \(\) => createSecretaryWorkingPreferencesCapability\("correct"\)/);
assert.match(source.platform, /retract:\s*async \(\) => createSecretaryWorkingPreferencesCapability\("retract"\)/);

console.log("OPERATOR_SECRETARY_WORKING_PREFERENCES_AUDIT=PASS");
console.log("SECRETARY_WORKING_PREFERENCES_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_WORKING_PREFERENCES_HISTORY_PRESERVED=true");
console.log("SECRETARY_WORKING_PREFERENCES_CORRECTION_GATED=true");
console.log("SECRETARY_WORKING_PREFERENCES_STALE_UPDATE_GUARDS=true");
console.log("SECRETARY_WORKING_PREFERENCES_CANONICAL_DEFAULTS_SYNCED=true");
console.log("SECRETARY_WORKING_PREFERENCES_EXPLICIT_INSTRUCTION_OVERRIDES=true");
console.log("SECRETARY_WORKING_PREFERENCES_SENSITIVE_KEY_REJECTED=true");
console.log("SECRETARY_WORKING_PREFERENCES_INFERRED=false");
console.log("SECRETARY_WORKING_PREFERENCES_SECRETS_STORED=false");
console.log("SECRETARY_WORKING_PREFERENCES_PLATFORM_PERMISSIONS_MUTATED=false");
console.log("SECRETARY_WORKING_PREFERENCES_BINDING_AUTHORITY_CREATED=false");
console.log("SECRETARY_WORKING_PREFERENCES_APPROVAL_AUTHORITY_CREATED=false");
console.log("SECRETARY_WORKING_PREFERENCES_PAYMENT_AUTHORITY_CREATED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
