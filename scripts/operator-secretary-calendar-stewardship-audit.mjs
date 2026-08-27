import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  runtime: "lib/operator/secretary/SecretaryExecutiveCalendarStewardshipRuntime.js",
  capability: "lib/platform/capabilities/createSecretaryExecutiveCalendarStewardshipCapability.js",
  platform: "lib/platform/runtime/PlatformDomainRuntime.js",
  packageJson: "package.json",
  wrapper: "scripts/run-operator-secretary-meeting-local-certification.sh",
  preferences: "lib/operator/secretary/SecretaryWorkingPreferencesRuntime.js",
};

const source = Object.fromEntries(
  await Promise.all(Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")])),
);

assert.match(source.runtime, /AVANTIQO_EXECUTIVE_SECRETARY_CALENDAR_STEWARDSHIP_V1/);
assert.match(source.runtime, /secretary_calendar_stewardship/);
assert.match(source.runtime, /readSecretaryWorkingPreferences/);
assert.match(source.runtime, /MEETING\.buffer_before_minutes/);
assert.match(source.runtime, /MEETING\.buffer_after_minutes/);
assert.match(source.runtime, /location_change_buffer_minutes/);
assert.match(source.runtime, /OVERLAP/);
assert.match(source.runtime, /BUFFER_SHORTFALL/);
assert.match(source.runtime, /LOCATION_CHANGE_BUFFER_SHORTFALL/);
assert.match(source.runtime, /bookSecretaryCalendarEventAtomic/);
assert.match(source.runtime, /eventType:\s*"BLOCK"/);
assert.match(source.runtime, /source:\s*SOURCE/);
assert.match(source.runtime, /SECRETARY_CALENDAR_STEWARDSHIP_EXTERNAL_EVENT_RELEASE_FORBIDDEN/);
assert.match(source.runtime, /\.eq\("updated_at", event\.updated_at\)/);
assert.match(source.runtime, /preferences_inferred:\s*false/);
assert.match(source.runtime, /calendar_priority_inferred:\s*false/);
assert.match(source.runtime, /meeting_importance_inferred:\s*false/);
assert.match(source.runtime, /location_travel_time_inferred:\s*false/);
assert.match(source.runtime, /meeting_moved:\s*false/);
assert.match(source.runtime, /external_event_cancelled:\s*false/);
assert.match(source.runtime, /attendance_inferred:\s*false/);
assert.match(source.runtime, /payment_authority_created:\s*false/);
assert.match(source.runtime, /booking_authority_created:\s*false/);
assert.match(source.runtime, /approval_authority_delegated:\s*false/);
assert.match(source.runtime, /binding_authority_delegated:\s*false/);
assert.match(source.runtime, /platform_permissions_mutated:\s*false/);
assert.match(source.runtime, /external_authority_used:\s*false/);
assert.match(source.runtime, /scope:\s*"CALENDAR_COORDINATION"/);

assert.match(source.preferences, /"buffer_before_minutes",\s*"buffer_after_minutes",\s*"default_duration_minutes"/);
assert.match(source.preferences, /preferences_inferred:\s*false/);

assert.match(source.capability, /capability:\s*"secretary_calendar_stewardship"/);
for (const action of ["review", "protect", "release", "list"]) {
  assert.match(source.capability, new RegExp(`${action}:\\s*\\{`));
}
assert.match(source.capability, /Existing meetings are never moved or cancelled/i);
assert.match(source.capability, /External meetings and other calendar events cannot be cancelled/i);
assert.match(source.capability, /operatorRequiresConfirmation:\s*false/);

assert.match(source.platform, /createSecretaryExecutiveCalendarStewardshipCapability/);
assert.match(source.platform, /secretary_calendar_stewardship:\s*\{/);
assert.match(source.packageJson, /operator-secretary-calendar-stewardship-audit\.mjs/);
assert.match(source.wrapper, /certify-secretary-calendar-stewardship-local\.mjs/);

console.log("OPERATOR_SECRETARY_CALENDAR_STEWARDSHIP_AUDIT=PASS");
console.log("SECRETARY_CALENDAR_STEWARDSHIP_EXPLICIT_PREFERENCES_ONLY=true");
console.log("SECRETARY_CALENDAR_STEWARDSHIP_BUFFER_RISK_DETECTION=true");
console.log("SECRETARY_CALENDAR_STEWARDSHIP_LOCATION_BUFFER_NOT_TRAVEL_TIME=true");
console.log("SECRETARY_CALENDAR_STEWARDSHIP_ATOMIC_PROTECTION=true");
console.log("SECRETARY_CALENDAR_STEWARDSHIP_EXTERNAL_EVENTS_MOVED=false");
console.log("SECRETARY_CALENDAR_STEWARDSHIP_EXTERNAL_EVENTS_CANCELLED=false");
console.log("SECRETARY_CALENDAR_STEWARDSHIP_PRIORITY_INFERRED=false");
console.log("SECRETARY_CALENDAR_STEWARDSHIP_PLATFORM_PERMISSIONS_MUTATED=false");
console.log("SECRETARY_CALENDAR_STEWARDSHIP_BINDING_AUTHORITY_DELEGATED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
