import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const transition = fs.readFileSync("lib/hotel/server/transitionHotelBooking.js", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260906154800_hotel_atomic_checkout_transition.sql", "utf8");

test("Hotel checkout keeps human-readable readiness in the server boundary", () => {
  assert.match(transition, /getHotelOperationalDate/);
  assert.match(transition, /getDepartureReadiness/);
  assert.match(transition, /firstHotelDepartureBlockerMessage/);
  assert.match(transition, /readiness\.can_check_out/);
});

test("Hotel checkout finalization is one guarded database transaction", () => {
  assert.match(transition, /rpc\("hotel_check_out_booking_guarded"/);
  assert.doesNotMatch(transition, /normalizedAction === "CHECK_OUT" && booking\.room_id/);
  assert.match(migration, /for update/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /set status = 'CHECKED_OUT'/);
  assert.match(migration, /set status = 'DIRTY'/);
  assert.match(migration, /insert into public\.hotel_housekeeping_tasks/);
});

test("atomic checkout revalidates settlement and early-departure invariants under lock", () => {
  assert.match(migration, /early_departure_review_status/);
  assert.match(migration, /guest folio is still open/);
  assert.match(migration, /status, ''\) = 'PENDING'/);
  assert.match(migration, /processor_mode, ''\) = 'AVANTIQO_GATEWAY'/);
  assert.match(migration, /finance_payment_id is null/);
});

test("atomic checkout RPC is not callable from browser roles", () => {
  assert.match(migration, /security invoker/i);
  assert.match(migration, /revoke all on function public\.hotel_check_out_booking_guarded\(uuid, uuid, date\) from public/);
  assert.match(migration, /revoke all on function public\.hotel_check_out_booking_guarded\(uuid, uuid, date\) from anon/);
  assert.match(migration, /revoke all on function public\.hotel_check_out_booking_guarded\(uuid, uuid, date\) from authenticated/);
  assert.match(migration, /grant execute on function public\.hotel_check_out_booking_guarded\(uuid, uuid, date\) to service_role/);
});
