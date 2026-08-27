import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "../lib/shared/supabase/admin.js";
import {
  reserveSecretaryResource,
  changeSecretaryResourceReservation,
  releaseSecretaryResourceReservation,
  readSecretaryResourceReservation,
  listSecretaryResourceReservations,
} from "../lib/operator/secretary/SecretaryResourceReservationRuntime.js";

const organizationId = randomUUID();
const ownerPartyId = randomUUID();
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

await one(supabaseAdmin.from("organizations").insert({ id: organizationId, name: "Secretary Resource Reservation Local Cert" }).select("*").single());
await one(supabaseAdmin.from("parties").insert({ id: ownerPartyId, organization_id: organizationId, display_name: "Executive Owner", party_type: "PERSON", status: "ACTIVE" }).select("*").single());
await one(supabaseAdmin.from("secretary_settings").insert({ organization_id: organizationId, default_timezone: "Asia/Bangkok", appointment_duration_minutes: 30, business_hours: {}, booking_policy: { owner_party_id: ownerPartyId }, metadata: { owner_party_id: ownerPartyId } }).select("*").single());

const first = await reserveSecretaryResource({
  context,
  payload: {
    resource_key: "boardroom-a",
    resource_name: "Boardroom A",
    resource_type: "ROOM",
    starts_at: "2035-08-01T03:00:00Z",
    ends_at: "2035-08-01T04:00:00Z",
    timezone: "Asia/Bangkok",
    purpose: "Executive review",
    capacity: 10,
    evidence_id: "resource-reserve-1",
    reserved_at: "2035-07-30T03:00:00Z",
  },
});
assert.equal(first.record.state, "RESERVED");
assert.equal(first.record.version, 1);
assert.equal(first.record.resource_key, "boardroom-a");
assert.equal(first.record.resource_type, "ROOM");

await rejectsMessage(
  () => reserveSecretaryResource({
    context,
    payload: {
      resource_key: "boardroom-a",
      resource_name: "Boardroom A",
      resource_type: "ROOM",
      starts_at: "2035-08-01T03:30:00Z",
      ends_at: "2035-08-01T04:30:00Z",
      timezone: "Asia/Bangkok",
      evidence_id: "resource-overlap-1",
      reserved_at: "2035-07-30T03:01:00Z",
    },
  }),
  "SECRETARY_RESOURCE_RESERVATION_SLOT_UNAVAILABLE",
);

const adjacent = await reserveSecretaryResource({
  context,
  payload: {
    resource_key: "boardroom-a",
    resource_name: "Boardroom A",
    resource_type: "ROOM",
    starts_at: "2035-08-01T04:00:00Z",
    ends_at: "2035-08-01T05:00:00Z",
    timezone: "Asia/Bangkok",
    evidence_id: "resource-reserve-2",
    reserved_at: "2035-07-30T03:02:00Z",
  },
});
assert.equal(adjacent.record.state, "RESERVED");

const equipment = await reserveSecretaryResource({
  context,
  payload: {
    resource_key: "projector-1",
    resource_name: "Projector 1",
    resource_type: "EQUIPMENT",
    starts_at: "2035-08-01T03:30:00Z",
    ends_at: "2035-08-01T04:30:00Z",
    timezone: "Asia/Bangkok",
    evidence_id: "resource-reserve-3",
    reserved_at: "2035-07-30T03:03:00Z",
  },
});
assert.equal(equipment.record.resource_type, "EQUIPMENT");

const changed = await changeSecretaryResourceReservation({
  context,
  payload: {
    reservation_id: first.reservation.id,
    expected_version: 1,
    starts_at: "2035-08-01T02:00:00Z",
    ends_at: "2035-08-01T03:00:00Z",
    timezone: "Asia/Bangkok",
    purpose: "Executive review moved earlier",
    capacity: 10,
    evidence_id: "resource-change-1",
    changed_at: "2035-07-30T03:10:00Z",
  },
});
assert.equal(changed.record.version, 2);
assert.equal(changed.record.starts_at, "2035-08-01T02:00:00+00:00");
assert.equal(changed.record.history.length, 2);

await rejectsMessage(
  () => changeSecretaryResourceReservation({
    context,
    payload: {
      reservation_id: first.reservation.id,
      expected_version: 1,
      starts_at: "2035-08-01T01:00:00Z",
      ends_at: "2035-08-01T02:00:00Z",
      timezone: "Asia/Bangkok",
      evidence_id: "resource-stale-1",
      changed_at: "2035-07-30T03:11:00Z",
    },
  }),
  "SECRETARY_RESOURCE_RESERVATION_STALE_VERSION",
);

await rejectsMessage(
  () => changeSecretaryResourceReservation({
    context,
    payload: {
      reservation_id: first.reservation.id,
      expected_version: 2,
      starts_at: "2035-08-01T04:15:00Z",
      ends_at: "2035-08-01T04:45:00Z",
      timezone: "Asia/Bangkok",
      evidence_id: "resource-change-overlap-1",
      changed_at: "2035-07-30T03:12:00Z",
    },
  }),
  "SECRETARY_RESOURCE_RESERVATION_SLOT_UNAVAILABLE",
);

const released = await releaseSecretaryResourceReservation({
  context,
  payload: {
    reservation_id: first.reservation.id,
    expected_version: 2,
    evidence_id: "resource-release-1",
    released_at: "2035-07-30T03:20:00Z",
    reason: "Executive no longer needs the earlier room allocation",
  },
});
assert.equal(released.record.state, "RELEASED");
assert.equal(released.record.version, 3);
assert.equal(released.reservation.status, "DONE");

const reuseFreedSlot = await reserveSecretaryResource({
  context,
  payload: {
    resource_key: "boardroom-a",
    resource_name: "Boardroom A",
    resource_type: "ROOM",
    starts_at: "2035-08-01T02:15:00Z",
    ends_at: "2035-08-01T02:45:00Z",
    timezone: "Asia/Bangkok",
    evidence_id: "resource-reserve-after-release",
    reserved_at: "2035-07-30T03:21:00Z",
  },
});
assert.equal(reuseFreedSlot.record.state, "RESERVED");

const read = await readSecretaryResourceReservation({ context, payload: { reservation_id: first.reservation.id } });
assert.equal(read.record.state, "RELEASED");
assert.equal(read.record.history.length, 3);

const active = await listSecretaryResourceReservations({ context, payload: { resource_key: "boardroom-a" } });
assert.equal(active.reservations.every(({ record }) => record.state === "RESERVED"), true);
const all = await listSecretaryResourceReservations({ context, payload: { resource_key: "boardroom-a", include_released: true } });
assert.ok(all.count >= 3);

for (const result of [first, adjacent, equipment, changed, released, reuseFreedSlot, read, active, all]) {
  assert.equal(result.external_booking_performed, false);
  assert.equal(result.calendar_event_created, false);
  assert.equal(result.calendar_event_modified, false);
  assert.equal(result.room_setup_performed, false);
  assert.equal(result.purchase_performed, false);
  assert.equal(result.payment_authority_created, false);
  assert.equal(result.signing_authority_created, false);
  assert.equal(result.approval_authority_delegated, false);
  assert.equal(result.binding_authority_delegated, false);
  assert.equal(result.platform_permissions_mutated, false);
  assert.equal(result.provider_calls_performed, false);
  assert.equal(result.external_authority_used, false);
}

console.log("SECRETARY_RESOURCE_RESERVATION_LOCAL_CERTIFICATION=PASS");
console.log("SECRETARY_RESOURCE_RESERVATION_ATOMIC_OVERLAP_ENFORCED=true");
console.log("SECRETARY_RESOURCE_RESERVATION_ADJACENT_SLOT_ALLOWED=true");
console.log("SECRETARY_RESOURCE_RESERVATION_DIFFERENT_RESOURCE_ALLOWED=true");
console.log("SECRETARY_RESOURCE_RESERVATION_CHANGE_OVERLAP_BLOCKED=true");
console.log("SECRETARY_RESOURCE_RESERVATION_STALE_VERSION_FENCED=true");
console.log("SECRETARY_RESOURCE_RESERVATION_RELEASE_FREES_SLOT=true");
console.log("SECRETARY_RESOURCE_RESERVATION_HISTORY_PRESERVED=true");
console.log("SECRETARY_RESOURCE_RESERVATION_EXTERNAL_BOOKING_PERFORMED=false");
console.log("SECRETARY_RESOURCE_RESERVATION_CALENDAR_EVENT_CREATED=false");
console.log("SECRETARY_RESOURCE_RESERVATION_CALENDAR_EVENT_MODIFIED=false");
console.log("SECRETARY_RESOURCE_RESERVATION_ROOM_SETUP_PERFORMED=false");
console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
