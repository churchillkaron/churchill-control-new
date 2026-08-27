import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../lib/shared/supabase/admin.js";
import {
  startSecretaryEventGuestCoordination,
  recordSecretaryEventGuestInvitation,
  recordSecretaryEventGuestResponse,
  remindSecretaryEventGuest,
  finalizeSecretaryEventGuestList,
  reopenSecretaryEventGuestList,
  readSecretaryEventGuestCoordination,
} from "../lib/operator/secretary/SecretaryEventGuestCoordinationRuntime.js";

const organizationId = randomUUID();
const ownerPartyId = randomUUID();
const guestA = randomUUID();
const guestB = randomUUID();
const context = { organizationId, timezone: "Asia/Bangkok", actor: { partyId: ownerPartyId }, metadata: { partyId: ownerPartyId } };

async function one(result) { const resolved = await result; if (resolved.error) throw resolved.error; return resolved.data || null; }
async function rejectsMessage(run, expected) { let caught = null; try { await run(); } catch (error) { caught = error; } assert.ok(caught, `Expected rejection ${expected}`); assert.equal(caught.message, expected); }

await one(supabaseAdmin.from("organizations").insert({ id: organizationId, name: "Secretary Event Guest Local Cert" }).select("*").single());
await one(supabaseAdmin.from("parties").insert([
  { id: ownerPartyId, organization_id: organizationId, display_name: "Executive Owner", party_type: "PERSON", status: "ACTIVE" },
  { id: guestA, organization_id: organizationId, display_name: "Guest A", party_type: "PERSON", status: "ACTIVE" },
  { id: guestB, organization_id: organizationId, display_name: "Guest B", party_type: "PERSON", status: "ACTIVE" },
]).select("*"));
await one(supabaseAdmin.from("secretary_settings").insert({ organization_id: organizationId, default_timezone: "Asia/Bangkok", appointment_duration_minutes: 30, business_hours: {}, booking_policy: { owner_party_id: ownerPartyId }, metadata: { owner_party_id: ownerPartyId } }).select("*").single());

const started = await startSecretaryEventGuestCoordination({
  context,
  payload: {
    title: "Executive Reception",
    starts_at: "2035-08-12T11:00:00Z",
    ends_at: "2035-08-12T13:00:00Z",
    timezone: "Asia/Bangkok",
    location: "Executive Lounge",
    guests: [
      { party_id: guestA, role: "Investor", action_type: "EMAIL" },
      { party_id: guestB, role: "Advisor", action_type: "MESSAGE" },
    ],
    evidence_id: "event-start-1",
    started_at: "2035-08-01T01:00:00Z",
  },
});
assert.equal(started.record.state, "OPEN");
assert.equal(started.record.version, 1);
assert.equal(started.counts.total, 2);
assert.equal(started.counts.pending, 2);

const invitationA = await recordSecretaryEventGuestInvitation({
  context,
  payload: {
    coordination_id: started.coordination.id,
    expected_version: 1,
    party_id: guestA,
    invitation_status: "SENT",
    evidence_id: "invite-a-1",
    occurred_at: "2035-08-01T01:05:00Z",
  },
});
assert.equal(invitationA.record.version, 2);
assert.equal(invitationA.record.guests.find((g) => g.party_id === guestA).invitation_status, "SENT");

const acceptedA = await recordSecretaryEventGuestResponse({
  context,
  payload: {
    coordination_id: started.coordination.id,
    expected_version: 2,
    party_id: guestA,
    response_status: "ACCEPTED",
    note: "Confirmed by reply",
    evidence_id: "rsvp-a-1",
    occurred_at: "2035-08-01T01:10:00Z",
  },
});
assert.equal(acceptedA.record.version, 3);
assert.equal(acceptedA.record.guests.find((g) => g.party_id === guestA).response_status, "ACCEPTED");

await rejectsMessage(
  () => finalizeSecretaryEventGuestList({
    context,
    payload: {
      coordination_id: started.coordination.id,
      expected_version: 3,
      evidence_id: "finalize-too-early",
      occurred_at: "2035-08-01T01:15:00Z",
    },
  }),
  "SECRETARY_EVENT_GUEST_REQUIRED_RESPONSES_PENDING",
);

const remindedB = await remindSecretaryEventGuest({
  context,
  payload: {
    coordination_id: started.coordination.id,
    expected_version: 3,
    party_id: guestB,
    due_at: "2035-08-03T01:00:00Z",
    evidence_id: "remind-b-1",
    occurred_at: "2035-08-01T01:20:00Z",
  },
});
assert.equal(remindedB.record.version, 4);
assert.equal(remindedB.record.guests.find((g) => g.party_id === guestB).reminder_count, 1);

await rejectsMessage(
  () => recordSecretaryEventGuestResponse({
    context,
    payload: {
      coordination_id: started.coordination.id,
      expected_version: 3,
      party_id: guestB,
      response_status: "DECLINED",
      evidence_id: "rsvp-b-stale",
      occurred_at: "2035-08-01T01:25:00Z",
    },
  }),
  "SECRETARY_EVENT_GUEST_STALE_VERSION",
);

const declinedB = await recordSecretaryEventGuestResponse({
  context,
  payload: {
    coordination_id: started.coordination.id,
    expected_version: 4,
    party_id: guestB,
    response_status: "DECLINED",
    note: "Unable to attend",
    evidence_id: "rsvp-b-1",
    occurred_at: "2035-08-01T01:30:00Z",
  },
});
assert.equal(declinedB.record.version, 5);
assert.equal(declinedB.record.guests.find((g) => g.party_id === guestB).response_status, "DECLINED");

const finalized = await finalizeSecretaryEventGuestList({
  context,
  payload: {
    coordination_id: started.coordination.id,
    expected_version: 5,
    evidence_id: "finalize-1",
    occurred_at: "2035-08-01T01:35:00Z",
  },
});
assert.equal(finalized.record.state, "FINALIZED");
assert.equal(finalized.record.version, 6);
assert.equal(finalized.record.finalized_counts.accepted, 1);
assert.equal(finalized.record.finalized_counts.declined, 1);

const replay = await finalizeSecretaryEventGuestList({
  context,
  payload: {
    coordination_id: started.coordination.id,
    expected_version: 5,
    evidence_id: "finalize-1",
    occurred_at: "2035-08-01T01:35:00Z",
  },
});
assert.equal(replay.replay_safe, true);

const reopened = await reopenSecretaryEventGuestList({
  context,
  payload: {
    coordination_id: started.coordination.id,
    expected_version: 6,
    evidence_id: "reopen-1",
    occurred_at: "2035-08-01T01:40:00Z",
  },
});
assert.equal(reopened.record.state, "OPEN");
assert.equal(reopened.record.version, 7);

const read = await readSecretaryEventGuestCoordination({ context, payload: { coordination_id: started.coordination.id } });
assert.equal(read.record.version, 7);
assert.equal(read.counts.accepted, 1);
assert.equal(read.counts.declined, 1);

for (const result of [started, invitationA, acceptedA, remindedB, declinedB, finalized, replay, reopened, read]) {
  assert.equal(result.attendance_inferred, false);
  assert.equal(result.invitation_delivery_inferred, false);
  assert.equal(result.physical_access_granted_by_secretary, false);
  assert.equal(result.calendar_event_created, false);
  assert.equal(result.calendar_event_modified, false);
  assert.equal(result.resource_reserved, false);
  assert.equal(result.room_setup_performed, false);
  assert.equal(result.catering_ordered, false);
  assert.equal(result.vendor_commitment_created, false);
  assert.equal(result.payment_authority_created, false);
  assert.equal(result.external_booking_performed, false);
  assert.equal(result.external_authority_used, false);
}

console.log("SECRETARY_EVENT_GUEST_COORDINATION_LOCAL_CERTIFICATION=PASS");
console.log("SECRETARY_EVENT_GUEST_EXPLICIT_RSVP_ONLY=true");
console.log("SECRETARY_EVENT_GUEST_FINALIZE_BLOCKED_WHILE_REQUIRED_PENDING=true");
console.log("SECRETARY_EVENT_GUEST_REMINDER_COORDINATED=true");
console.log("SECRETARY_EVENT_GUEST_STALE_VERSION_FENCED=true");
console.log("SECRETARY_EVENT_GUEST_EVIDENCE_REPLAY_SAFE=true");
console.log("SECRETARY_EVENT_GUEST_REOPEN_SUPPORTED=true");
console.log("SECRETARY_EVENT_GUEST_ATTENDANCE_INFERRED=false");
console.log("SECRETARY_EVENT_GUEST_PHYSICAL_ACCESS_GRANTED=false");
console.log("SECRETARY_EVENT_GUEST_CALENDAR_EVENT_MUTATED=false");
console.log("SECRETARY_EVENT_GUEST_RESOURCE_RESERVED=false");
console.log("SECRETARY_EVENT_GUEST_CATERING_ORDERED=false");
console.log("SECRETARY_EVENT_GUEST_VENDOR_COMMITMENT_CREATED=false");
console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
