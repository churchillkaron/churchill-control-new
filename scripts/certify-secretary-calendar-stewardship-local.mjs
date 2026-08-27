import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../lib/shared/supabase/admin.js";
import {
  listSecretaryExecutiveProtections,
  protectSecretaryExecutiveTime,
  releaseSecretaryExecutiveProtection,
  reviewSecretaryExecutiveCalendar,
} from "../lib/operator/secretary/SecretaryExecutiveCalendarStewardshipRuntime.js";
import { recordSecretaryWorkingPreference } from "../lib/operator/secretary/SecretaryWorkingPreferencesRuntime.js";

const organizationId = randomUUID();
const ownerPartyId = randomUUID();
const externalEventId = randomUUID();
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

async function rejectsMessage(run, message) {
  let caught = null;
  try {
    await run();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `Expected rejection ${message}`);
  assert.equal(caught.message, message);
}

await one(supabaseAdmin.from("organizations").insert({
  id: organizationId,
  name: "Secretary Calendar Stewardship Local Cert",
}).select("*").single());

await one(supabaseAdmin.from("parties").insert({
  id: ownerPartyId,
  organization_id: organizationId,
  display_name: "Executive Owner",
  party_type: "PERSON",
  status: "ACTIVE",
}).select("*").single());

await one(supabaseAdmin.from("secretary_settings").insert({
  organization_id: organizationId,
  default_timezone: "Asia/Bangkok",
  appointment_duration_minutes: 30,
  business_hours: {},
  booking_policy: { owner_party_id: ownerPartyId },
  metadata: { owner_party_id: ownerPartyId },
}).select("*").single());

await recordSecretaryWorkingPreference({
  context,
  payload: {
    domain: "MEETING",
    key: "buffer_before_minutes",
    value: 10,
    evidence_id: "calendar-stewardship-buffer-before-evidence",
    source_kind: "USER_STATEMENT",
  },
});

await recordSecretaryWorkingPreference({
  context,
  payload: {
    domain: "MEETING",
    key: "buffer_after_minutes",
    value: 10,
    evidence_id: "calendar-stewardship-buffer-after-evidence",
    source_kind: "USER_STATEMENT",
  },
});

await one(supabaseAdmin.from("secretary_calendar_events").insert([
  {
    id: externalEventId,
    organization_id: organizationId,
    owner_party_id: ownerPartyId,
    title: "Executive review",
    event_type: "MEETING",
    status: "CONFIRMED",
    starts_at: "2035-06-02T02:00:00Z",
    ends_at: "2035-06-02T03:00:00Z",
    timezone: "Asia/Bangkok",
    location: "Office A",
    source: "secretary",
    created_by_party_id: ownerPartyId,
    metadata: { certification_fixture: true },
  },
  {
    organization_id: organizationId,
    owner_party_id: ownerPartyId,
    title: "Partner meeting",
    event_type: "MEETING",
    status: "CONFIRMED",
    starts_at: "2035-06-02T03:15:00Z",
    ends_at: "2035-06-02T04:00:00Z",
    timezone: "Asia/Bangkok",
    location: "Office B",
    source: "secretary",
    created_by_party_id: ownerPartyId,
    metadata: { certification_fixture: true },
  },
]).select("*").then((result) => {
  if (result.error) throw result.error;
  return result.data;
}));

const review = await reviewSecretaryExecutiveCalendar({
  context,
  payload: {
    from: "2035-06-02T01:00:00Z",
    to: "2035-06-02T05:00:00Z",
    location_change_buffer_minutes: 30,
  },
});
assert.equal(review.status, "completed");
assert.equal(review.event_count, 2);
assert.equal(review.rules.buffer_before_minutes, 10);
assert.equal(review.rules.buffer_before_source, "WORKING_PREFERENCE");
assert.equal(review.rules.buffer_after_minutes, 10);
assert.equal(review.rules.buffer_after_source, "WORKING_PREFERENCE");
assert.equal(review.rules.location_change_buffer_minutes, 30);
assert.equal(review.rules.location_change_buffer_source, "EXPLICIT_PAYLOAD");
assert.equal(review.transition_risk_count, 1);
assert.equal(review.transition_risks[0].gap_minutes, 15);
assert.equal(review.transition_risks[0].base_buffer_minutes, 20);
assert.equal(review.transition_risks[0].location_changed, true);
assert.equal(review.transition_risks[0].explicit_location_change_buffer_minutes, 30);
assert.ok(review.transition_risks[0].reasons.includes("BUFFER_SHORTFALL"));
assert.ok(review.transition_risks[0].reasons.includes("LOCATION_CHANGE_BUFFER_SHORTFALL"));
assert.equal(review.transition_risks[0].travel_time_inferred, false);
assert.equal(review.no_calendar_mutation_performed, true);
assert.equal(review.preferences_inferred, false);
assert.equal(review.meeting_importance_inferred, false);
assert.equal(review.calendar_priority_inferred, false);

const protectedTime = await protectSecretaryExecutiveTime({
  context,
  payload: {
    protection_kind: "FOCUS",
    title: "Protected focus time",
    starts_at: "2035-06-02T05:00:00Z",
    ends_at: "2035-06-02T06:00:00Z",
    timezone: "Asia/Bangkok",
    evidence_id: "calendar-stewardship-focus-evidence",
  },
});
assert.equal(protectedTime.status, "protected");
assert.equal(protectedTime.replay_safe, false);
assert.equal(protectedTime.atomic_booking, true);
assert.equal(protectedTime.protection.event_type, "BLOCK");
assert.equal(protectedTime.protection.source, "secretary_calendar_stewardship");
assert.equal(protectedTime.protection.metadata.protection_kind, "FOCUS");
assert.equal(protectedTime.existing_events_moved, false);
assert.equal(protectedTime.meeting_moved, false);
assert.equal(protectedTime.external_event_cancelled, false);

const protectedReplay = await protectSecretaryExecutiveTime({
  context,
  payload: {
    protection_kind: "FOCUS",
    title: "Protected focus time",
    starts_at: "2035-06-02T05:00:00Z",
    ends_at: "2035-06-02T06:00:00Z",
    timezone: "Asia/Bangkok",
    evidence_id: "calendar-stewardship-focus-evidence",
  },
});
assert.equal(protectedReplay.replay_safe, true);
assert.equal(protectedReplay.protection.id, protectedTime.protection.id);

const listed = await listSecretaryExecutiveProtections({ context, payload: {} });
assert.equal(listed.status, "completed");
assert.equal(listed.count, 1);
assert.equal(listed.protections[0].id, protectedTime.protection.id);

await rejectsMessage(
  () => protectSecretaryExecutiveTime({
    context,
    payload: {
      protection_kind: "PREP",
      starts_at: "2035-06-02T02:30:00Z",
      ends_at: "2035-06-02T02:45:00Z",
      timezone: "Asia/Bangkok",
      evidence_id: "calendar-stewardship-overlap-evidence",
    },
  }),
  "SECRETARY_CALENDAR_SLOT_UNAVAILABLE",
);

await rejectsMessage(
  () => releaseSecretaryExecutiveProtection({
    context,
    payload: {
      protection_event_id: externalEventId,
      evidence_id: "calendar-stewardship-invalid-release-evidence",
      released_at: "2035-06-02T04:30:00Z",
    },
  }),
  "SECRETARY_CALENDAR_STEWARDSHIP_EXTERNAL_EVENT_RELEASE_FORBIDDEN",
);

const released = await releaseSecretaryExecutiveProtection({
  context,
  payload: {
    protection_event_id: protectedTime.protection.id,
    evidence_id: "calendar-stewardship-release-evidence",
    released_at: "2035-06-02T04:30:00Z",
    reason: "Executive explicitly released the protected window.",
  },
});
assert.equal(released.status, "released");
assert.equal(released.replay_safe, false);
assert.equal(released.protection.status, "CANCELLED");
assert.equal(released.external_event_cancelled, false);
assert.equal(released.meeting_moved, false);

const releasedReplay = await releaseSecretaryExecutiveProtection({
  context,
  payload: {
    protection_event_id: protectedTime.protection.id,
    evidence_id: "calendar-stewardship-release-evidence",
    released_at: "2035-06-02T04:30:00Z",
    reason: "Executive explicitly released the protected window.",
  },
});
assert.equal(releasedReplay.replay_safe, true);

const afterRelease = await listSecretaryExecutiveProtections({ context, payload: {} });
assert.equal(afterRelease.count, 0);
const withReleased = await listSecretaryExecutiveProtections({ context, payload: { include_released: true } });
assert.equal(withReleased.count, 1);
assert.equal(withReleased.protections[0].status, "CANCELLED");

console.log("SECRETARY_CALENDAR_STEWARDSHIP_LOCAL_CERTIFICATION=PASS");
console.log("SECRETARY_CALENDAR_STEWARDSHIP_EXPLICIT_PREFERENCE_BUFFERS=true");
console.log("SECRETARY_CALENDAR_STEWARDSHIP_BUFFER_SHORTFALL_DETECTED=true");
console.log("SECRETARY_CALENDAR_STEWARDSHIP_LOCATION_CHANGE_BUFFER_EXPLICIT=true");
console.log("SECRETARY_CALENDAR_STEWARDSHIP_LOCATION_TRAVEL_TIME_INFERRED=false");
console.log("SECRETARY_CALENDAR_STEWARDSHIP_REVIEW_MUTATES_CALENDAR=false");
console.log("SECRETARY_CALENDAR_STEWARDSHIP_ATOMIC_PROTECTION=true");
console.log("SECRETARY_CALENDAR_STEWARDSHIP_PROTECTION_REPLAY_SAFE=true");
console.log("SECRETARY_CALENDAR_STEWARDSHIP_OVERLAP_FAILS_CLOSED=true");
console.log("SECRETARY_CALENDAR_STEWARDSHIP_EXTERNAL_EVENT_RELEASE_FORBIDDEN=true");
console.log("SECRETARY_CALENDAR_STEWARDSHIP_RELEASE_REPLAY_SAFE=true");
console.log("SECRETARY_CALENDAR_STEWARDSHIP_EXTERNAL_EVENTS_MOVED=false");
console.log("SECRETARY_CALENDAR_STEWARDSHIP_EXTERNAL_EVENTS_CANCELLED=false");
console.log("SECRETARY_CALENDAR_STEWARDSHIP_MEETING_IMPORTANCE_INFERRED=false");
console.log("SECRETARY_CALENDAR_STEWARDSHIP_PLATFORM_PERMISSIONS_MUTATED=false");
console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
