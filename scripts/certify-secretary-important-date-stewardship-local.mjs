import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../lib/shared/supabase/admin.js";
import {
  listSecretaryUpcomingImportantDates,
  readSecretaryImportantDates,
  refreshSecretaryImportantDateReminders,
  registerSecretaryImportantDate,
  retireSecretaryImportantDate,
  reviseSecretaryImportantDate,
} from "../lib/operator/secretary/SecretaryImportantDateStewardshipRuntime.js";

const organizationId = randomUUID();
const ownerPartyId = randomUUID();
const contactPartyId = randomUUID();
const context = { organizationId, timezone: "Asia/Bangkok", actor: { partyId: ownerPartyId }, metadata: { partyId: ownerPartyId } };

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

async function rejectsMessage(run, expected) {
  let caught = null;
  try { await run(); } catch (error) { caught = error; }
  assert.ok(caught, `Expected rejection ${expected}`);
  assert.equal(caught.message, expected);
}

await one(supabaseAdmin.from("organizations").insert({ id: organizationId, name: "Secretary Important Date Local Cert" }).select("*").single());
await one(supabaseAdmin.from("parties").insert([
  { id: ownerPartyId, organization_id: organizationId, display_name: "Executive Owner", party_type: "PERSON", status: "ACTIVE" },
  { id: contactPartyId, organization_id: organizationId, display_name: "Important Contact", party_type: "PERSON", status: "ACTIVE" },
]).select("*"));
await one(supabaseAdmin.from("secretary_settings").insert({ organization_id: organizationId, default_timezone: "Asia/Bangkok", appointment_duration_minutes: 30, business_hours: {}, booking_policy: { owner_party_id: ownerPartyId }, metadata: { owner_party_id: ownerPartyId } }).select("*").single());

const birthday = await registerSecretaryImportantDate({ context, payload: {
  party_id: contactPartyId,
  kind: "BIRTHDAY",
  label: "Birthday",
  recurrence: "ANNUAL",
  month_day: "09-03",
  timezone: "Asia/Bangkok",
  reminder_days_before: [7, 1, 0],
  reminder_local_time: "09:00",
  evidence_id: "important-date-birthday-1",
  recorded_at: "2035-08-01T02:00:00Z",
  source_reference: "fixture://birthday",
} });
assert.equal(birthday.record.kind, "BIRTHDAY");
assert.equal(birthday.record.next_occurrence_date, "2035-09-03");
assert.equal(birthday.relationship_memory_is_source_of_truth, true);

const replay = await registerSecretaryImportantDate({ context, payload: {
  party_id: contactPartyId,
  kind: "BIRTHDAY",
  label: "Birthday",
  recurrence: "ANNUAL",
  month_day: "09-03",
  timezone: "Asia/Bangkok",
  reminder_days_before: [7, 1, 0],
  reminder_local_time: "09:00",
  evidence_id: "important-date-birthday-1",
  recorded_at: "2035-08-01T02:00:00Z",
  source_reference: "fixture://birthday",
} });
assert.equal(replay.replay_safe, true);

const refreshed = await refreshSecretaryImportantDateReminders({ context, payload: { party_id: contactPartyId, now: "2035-08-20T02:00:00Z", horizon_days: 30 } });
assert.equal(refreshed.reminders_created, 3);
assert.equal(refreshed.materialized.every((row) => row.follow_up_id), true);
const refreshedAgain = await refreshSecretaryImportantDateReminders({ context, payload: { party_id: contactPartyId, now: "2035-08-20T02:00:00Z", horizon_days: 30 } });
assert.equal(refreshedAgain.reminders_created, 0);
assert.equal(refreshedAgain.reminders_existing, 3);

await rejectsMessage(() => reviseSecretaryImportantDate({ context, payload: {
  party_id: contactPartyId,
  date_id: birthday.record.id,
  expected_version: 99,
  month_day: "09-04",
  reason: "Correction",
  evidence_id: "important-date-stale",
  occurred_at: "2035-08-21T02:00:00Z",
} }), "SECRETARY_IMPORTANT_DATE_STALE_VERSION");

const revised = await reviseSecretaryImportantDate({ context, payload: {
  party_id: contactPartyId,
  date_id: birthday.record.id,
  expected_version: 1,
  month_day: "09-04",
  reason: "Explicit correction evidence",
  evidence_id: "important-date-revise-1",
  occurred_at: "2035-08-21T02:00:00Z",
} });
assert.equal(revised.record.version, 2);
assert.equal(revised.record.month_day, "09-04");

await rejectsMessage(() => registerSecretaryImportantDate({ context, payload: {
  party_id: contactPartyId,
  kind: "BIRTHDAY",
  label: "Leap Birthday",
  recurrence: "ANNUAL",
  month_day: "02-29",
  timezone: "Asia/Bangkok",
  evidence_id: "important-date-leap-missing-policy",
  recorded_at: "2035-08-21T03:00:00Z",
} }), "SECRETARY_IMPORTANT_DATE_LEAP_DAY_POLICY_REQUIRED");

const leap = await registerSecretaryImportantDate({ context, payload: {
  party_id: contactPartyId,
  kind: "ANNIVERSARY",
  label: "Leap anniversary",
  recurrence: "ANNUAL",
  month_day: "02-29",
  leap_day_policy: "FEB_28",
  timezone: "Asia/Bangkok",
  reminder_days_before: [1],
  reminder_local_time: "08:30",
  evidence_id: "important-date-leap-1",
  recorded_at: "2037-01-01T02:00:00Z",
} });
assert.equal(leap.record.next_occurrence_date, "2037-02-28");

const oneOff = await registerSecretaryImportantDate({ context, payload: {
  party_id: contactPartyId,
  kind: "PERSONAL_MILESTONE",
  label: "One-off milestone",
  recurrence: "NONE",
  occurs_on: "2035-10-15",
  timezone: "Asia/Bangkok",
  reminder_days_before: [14],
  reminder_local_time: "10:00",
  evidence_id: "important-date-oneoff-1",
  recorded_at: "2035-08-22T02:00:00Z",
} });
assert.equal(oneOff.record.occurs_on, "2035-10-15");

const upcoming = await listSecretaryUpcomingImportantDates({ context, payload: { now: "2035-08-25T02:00:00Z", through_days: 60 } });
assert.ok(upcoming.upcoming.some((row) => row.record.id === birthday.record.id));
assert.ok(upcoming.upcoming.some((row) => row.record.id === oneOff.record.id));

const read = await readSecretaryImportantDates({ context, payload: { party_id: contactPartyId, now: "2035-08-25T02:00:00Z" } });
assert.ok(read.dates.length >= 3);

const retired = await retireSecretaryImportantDate({ context, payload: {
  party_id: contactPartyId,
  date_id: oneOff.record.id,
  expected_version: 1,
  reason: "No longer relevant",
  evidence_id: "important-date-retire-1",
  occurred_at: "2035-08-26T02:00:00Z",
} });
assert.equal(retired.record.status, "RETIRED");

for (const result of [birthday, replay, refreshed, refreshedAgain, revised, leap, oneOff, upcoming, read, retired]) {
  assert.equal(result.date_inferred, false);
  assert.equal(result.age_inferred, false);
  assert.equal(result.external_message_sent, false);
  assert.equal(result.gift_purchased, false);
  assert.equal(result.calendar_event_created, false);
  assert.equal(result.payment_authority_created, false);
  assert.equal(result.external_authority_used, false);
}

console.log("SECRETARY_IMPORTANT_DATE_STEWARDSHIP_LOCAL_CERTIFICATION=PASS");
console.log("SECRETARY_IMPORTANT_DATE_RELATIONSHIP_MEMORY_SOURCE_OF_TRUTH=true");
console.log("SECRETARY_IMPORTANT_DATE_EVIDENCE_REPLAY_SAFE=true");
console.log("SECRETARY_IMPORTANT_DATE_STALE_VERSION_FENCED=true");
console.log("SECRETARY_IMPORTANT_DATE_DETERMINISTIC_REMINDERS=true");
console.log("SECRETARY_IMPORTANT_DATE_ANNUAL_RECURRENCE_SUPPORTED=true");
console.log("SECRETARY_IMPORTANT_DATE_ONE_OFF_SUPPORTED=true");
console.log("SECRETARY_IMPORTANT_DATE_LEAP_DAY_POLICY_EXPLICIT=true");
console.log("SECRETARY_IMPORTANT_DATE_DATE_INFERRED=false");
console.log("SECRETARY_IMPORTANT_DATE_AGE_INFERRED=false");
console.log("SECRETARY_IMPORTANT_DATE_EXTERNAL_MESSAGE_SENT=false");
console.log("SECRETARY_IMPORTANT_DATE_GIFT_PURCHASED=false");
console.log("SECRETARY_IMPORTANT_DATE_CALENDAR_EVENT_CREATED=false");
console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
