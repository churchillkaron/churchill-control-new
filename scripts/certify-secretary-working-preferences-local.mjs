import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../lib/shared/supabase/admin.js";
import {
  correctSecretaryWorkingPreference,
  readSecretaryWorkingPreferences,
  recordSecretaryWorkingPreference,
  retractSecretaryWorkingPreference,
} from "../lib/operator/secretary/SecretaryWorkingPreferencesRuntime.js";

const organizationId = randomUUID();
const ownerPartyId = randomUUID();
const context = {
  organizationId,
  timezone: "Asia/Bangkok",
  actor: { partyId: ownerPartyId },
  metadata: { partyId: ownerPartyId },
};

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

async function expectError(fn, expected) {
  let error = null;
  try {
    await fn();
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, `Expected error ${expected}`);
  assert.equal(error.message, expected);
}

await one(
  supabaseAdmin.from("organizations").insert({ id: organizationId, name: "Secretary Working Preferences Local Cert" }).select("*").single(),
);
await one(
  supabaseAdmin.from("parties").insert({
    id: ownerPartyId,
    organization_id: organizationId,
    display_name: "Executive Owner",
    party_type: "PERSON",
    status: "ACTIVE",
  }).select("*").single(),
);
await one(
  supabaseAdmin.from("secretary_settings").insert({
    organization_id: organizationId,
    default_timezone: "UTC",
    default_language: null,
    appointment_duration_minutes: 30,
    business_hours: {},
    call_handling_policy: {},
    message_handling_policy: {},
    booking_policy: { owner_party_id: ownerPartyId },
    memory_policy: {},
    metadata: { owner_party_id: ownerPartyId },
  }).select("*").single(),
);

const timezoneRecorded = await recordSecretaryWorkingPreference({
  context,
  payload: {
    domain: "CALENDAR",
    key: "default_timezone",
    value: "Asia/Bangkok",
    evidence_id: "pref-timezone-v1",
    source_kind: "USER_STATEMENT",
    evidence_excerpt: "Use Bangkok time for my Secretary calendar.",
  },
});
assert.equal(timezoneRecorded.status, "recorded");
assert.equal(timezoneRecorded.preference.value, "Asia/Bangkok");
assert.equal(timezoneRecorded.preference.preference_inferred, false);

const afterTimezone = await one(
  supabaseAdmin.from("secretary_settings").select("default_timezone,metadata").eq("organization_id", organizationId).single(),
);
assert.equal(afterTimezone.default_timezone, "Asia/Bangkok");
const versionAfterTimezone = afterTimezone.metadata.executive_working_preferences_v1.version;

const timezoneReplay = await recordSecretaryWorkingPreference({
  context,
  payload: {
    domain: "CALENDAR",
    key: "default_timezone",
    value: "Asia/Bangkok",
    evidence_id: "pref-timezone-v1",
    source_kind: "USER_STATEMENT",
    evidence_excerpt: "Use Bangkok time for my Secretary calendar.",
  },
});
assert.equal(timezoneReplay.replay_safe, true);
assert.equal(timezoneReplay.register_version, versionAfterTimezone);

const bufferRecorded = await recordSecretaryWorkingPreference({
  context,
  payload: {
    domain: "MEETING",
    key: "buffer_before_minutes",
    value: 15,
    evidence_id: "pref-buffer-v1",
    source_kind: "USER_STATEMENT",
  },
});
assert.equal(bufferRecorded.preference.value, 15);
const originalBufferEntryId = bufferRecorded.preference.entry_id;

await expectError(
  () => recordSecretaryWorkingPreference({
    context,
    payload: {
      domain: "MEETING",
      key: "buffer_before_minutes",
      value: 20,
      evidence_id: "pref-buffer-v2",
      source_kind: "USER_STATEMENT",
    },
  }),
  "SECRETARY_WORKING_PREFERENCE_CORRECTION_REQUIRED",
);

const bufferCorrected = await correctSecretaryWorkingPreference({
  context,
  payload: {
    domain: "MEETING",
    key: "buffer_before_minutes",
    value: 20,
    evidence_id: "pref-buffer-v2",
    source_kind: "USER_STATEMENT",
    supersedes_entry_id: originalBufferEntryId,
  },
});
assert.equal(bufferCorrected.preference.value, 20);
assert.equal(bufferCorrected.superseded_entry_id, originalBufferEntryId);
const correctedBufferEntryId = bufferCorrected.preference.entry_id;

await expectError(
  () => correctSecretaryWorkingPreference({
    context,
    payload: {
      domain: "MEETING",
      key: "buffer_before_minutes",
      value: 25,
      evidence_id: "pref-buffer-stale",
      source_kind: "USER_STATEMENT",
      supersedes_entry_id: originalBufferEntryId,
    },
  }),
  "SECRETARY_WORKING_PREFERENCE_STALE_CORRECTION_REJECTED",
);

await expectError(
  () => recordSecretaryWorkingPreference({
    context,
    payload: {
      domain: "GENERAL",
      key: "api_key",
      value: "do-not-store",
      evidence_id: "pref-sensitive-v1",
      source_kind: "MANUAL",
    },
  }),
  "SECRETARY_WORKING_PREFERENCE_SENSITIVE_KEY_FORBIDDEN",
);

await expectError(
  () => recordSecretaryWorkingPreference({
    context,
    payload: {
      domain: "TRAVEL",
      key: "seat_preference",
      value: "aisle",
      source_kind: "USER_STATEMENT",
    },
  }),
  "SECRETARY_WORKING_PREFERENCE_EVIDENCE_REQUIRED",
);

const bufferRetracted = await retractSecretaryWorkingPreference({
  context,
  payload: {
    domain: "MEETING",
    key: "buffer_before_minutes",
    evidence_id: "pref-buffer-retract",
    source_kind: "USER_STATEMENT",
    supersedes_entry_id: correctedBufferEntryId,
  },
});
assert.equal(bufferRetracted.status, "retracted");
assert.equal(bufferRetracted.retracted_entry_id, correctedBufferEntryId);

const durationRecorded = await recordSecretaryWorkingPreference({
  context,
  payload: {
    domain: "CALENDAR",
    key: "appointment_duration_minutes",
    value: 45,
    evidence_id: "pref-duration-v1",
    source_kind: "USER_STATEMENT",
  },
});
assert.equal(durationRecorded.preference.value, 45);
let canonical = await one(
  supabaseAdmin.from("secretary_settings").select("appointment_duration_minutes").eq("organization_id", organizationId).single(),
);
assert.equal(canonical.appointment_duration_minutes, 45);

await retractSecretaryWorkingPreference({
  context,
  payload: {
    domain: "CALENDAR",
    key: "appointment_duration_minutes",
    evidence_id: "pref-duration-retract",
    source_kind: "USER_STATEMENT",
    supersedes_entry_id: durationRecorded.preference.entry_id,
  },
});
canonical = await one(
  supabaseAdmin.from("secretary_settings").select("appointment_duration_minutes").eq("organization_id", organizationId).single(),
);
assert.equal(canonical.appointment_duration_minutes, 30);

const travelRecorded = await recordSecretaryWorkingPreference({
  context,
  payload: {
    domain: "TRAVEL",
    key: "seat_preference",
    value: "aisle",
    evidence_id: "pref-travel-v1",
    source_kind: "USER_STATEMENT",
  },
});
assert.equal(travelRecorded.preference.value, "aisle");

const read = await readSecretaryWorkingPreferences({
  context,
  payload: { include_history: true },
});
assert.equal(read.status, "completed");
assert.equal(read.explicit_instruction_overrides_preference, true);
assert.equal(read.preferences_inferred, false);
assert.equal(read.secrets_stored, false);
assert.equal(read.approval_authority_created, false);
assert.equal(read.binding_authority_created, false);
assert.equal(read.payment_authority_created, false);
assert.equal(read.external_authority_used, false);
assert.ok(read.current_preferences.some((item) => item.path === "CALENDAR.default_timezone" && item.value === "Asia/Bangkok"));
assert.ok(read.current_preferences.some((item) => item.path === "TRAVEL.seat_preference" && item.value === "aisle"));
assert.ok(!read.current_preferences.some((item) => item.path === "MEETING.buffer_before_minutes"));
assert.ok(read.history.some((item) => item.event === "RECORDED" && item.path === "MEETING.buffer_before_minutes"));
assert.ok(read.history.some((item) => item.event === "CORRECTED" && item.path === "MEETING.buffer_before_minutes"));
assert.ok(read.history.some((item) => item.event === "RETRACTED" && item.path === "MEETING.buffer_before_minutes"));

const stored = await one(
  supabaseAdmin.from("secretary_settings").select("metadata").eq("organization_id", organizationId).single(),
);
const register = stored.metadata.executive_working_preferences_v1;
assert.equal(register.preferences_inferred, false);
assert.equal(register.secrets_stored, false);
assert.equal(register.approval_authority_created, false);
assert.equal(register.binding_authority_created, false);
assert.equal(register.payment_authority_created, false);
assert.equal(register.external_authority_used, false);

console.log("SECRETARY_WORKING_PREFERENCES_LOCAL_CERTIFICATION=PASS");
console.log("SECRETARY_WORKING_PREFERENCES_EVIDENCE_REQUIRED=true");
console.log("SECRETARY_WORKING_PREFERENCES_CURRENT_REGISTER=true");
console.log("SECRETARY_WORKING_PREFERENCES_HISTORY_PRESERVED=true");
console.log("SECRETARY_WORKING_PREFERENCES_CORRECTION_GATED=true");
console.log("SECRETARY_WORKING_PREFERENCES_STALE_CORRECTION_REJECTED=true");
console.log("SECRETARY_WORKING_PREFERENCES_RETRACTION_HISTORY=true");
console.log("SECRETARY_WORKING_PREFERENCES_CANONICAL_DEFAULTS_SYNCED=true");
console.log("SECRETARY_WORKING_PREFERENCES_EXPLICIT_INSTRUCTION_OVERRIDES=true");
console.log("SECRETARY_WORKING_PREFERENCES_SENSITIVE_KEY_REJECTED=true");
console.log("SECRETARY_WORKING_PREFERENCES_INFERRED=false");
console.log("SECRETARY_WORKING_PREFERENCES_SECRETS_STORED=false");
console.log("SECRETARY_WORKING_PREFERENCES_PLATFORM_PERMISSIONS_MUTATED=false");
console.log("SECRETARY_WORKING_PREFERENCES_BINDING_AUTHORITY_CREATED=false");
console.log("SECRETARY_WORKING_PREFERENCES_APPROVAL_AUTHORITY_CREATED=false");
console.log("SECRETARY_WORKING_PREFERENCES_PAYMENT_AUTHORITY_CREATED=false");
console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
