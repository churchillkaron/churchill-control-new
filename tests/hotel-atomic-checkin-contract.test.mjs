import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync("supabase/migrations/20260907080000_hotel_atomic_checkin_transition.sql", "utf8");
const transition = fs.readFileSync("lib/hotel/server/transitionHotelBooking.js", "utf8");

test("Hotel check-in commits booking and room state inside one guarded database transaction", () => {
  assert.match(migration, /create or replace function public\.hotel_check_in_booking_guarded/);
  assert.match(migration, /for update/);
  assert.match(migration, /update public\.hotel_bookings[\s\S]*status = 'CHECKED_IN'/);
  assert.match(migration, /update public\.hotel_rooms[\s\S]*status = 'OCCUPIED'/);
  assert.match(migration, /actual_check_in_at = v_changed_at/);
  assert.match(migration, /actual_check_in_business_date = p_business_date/);
});

test("atomic check-in independently revalidates hard arrival gates", () => {
  assert.match(migration, /booking is no longer reserved/);
  assert.match(migration, /a room must be assigned before check-in/);
  assert.match(migration, /a governed guest profile is required before check-in/);
  assert.match(migration, /scheduled arrival date is in a future property business day/);
  assert.match(migration, /required deposit is still outstanding/);
  assert.match(migration, /booking and room property differ/);
  assert.match(migration, /assigned room is no longer available/);
});

test("check-in participates in governed property-day authority before mutation", () => {
  const authority = migration.indexOf("hotel_assert_business_day_open");
  const bookingWrite = migration.indexOf("update public.hotel_bookings");
  assert.ok(authority >= 0 && bookingWrite > authority);
  assert.match(migration, /hotel_current_business_date_guarded/);
  assert.match(migration, /property business date changed before check-in completed/);
});

test("server keeps human-readable readiness but delegates commit authority to guarded RPC", () => {
  assert.match(transition, /evaluateHotelArrivalReadiness/);
  assert.match(transition, /firstHotelArrivalBlockerMessage/);
  assert.match(transition, /rpc\("hotel_check_in_booking_guarded"/);
  assert.match(transition, /p_business_date: operationalDate\.businessDate/);
  assert.doesNotMatch(transition, /from\("hotel_rooms"\)[\s\S]{0,300}\.update\(\{ status: "OCCUPIED"/);
  assert.doesNotMatch(transition, /from\("hotel_rooms"\)[\s\S]{0,400}\.update\(\{ status: "AVAILABLE"/);
});

test("guarded check-in is service-role only", () => {
  for (const role of ["public", "anon", "authenticated"]) {
    assert.ok(migration.includes(`revoke all on function public.hotel_check_in_booking_guarded(uuid, uuid, date) from ${role};`));
  }
  assert.match(migration, /grant execute on function public\.hotel_check_in_booking_guarded\(uuid, uuid, date\) to service_role/);
});
