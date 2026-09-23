import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const transitionRuntime = fs.readFileSync(new URL("../lib/hotel/server/transitionHousekeepingTask.js", import.meta.url), "utf8");
const transitionMigration = fs.readFileSync(new URL("../supabase/migrations/20260906032000_hotel_atomic_housekeeping_transition.sql", import.meta.url), "utf8");
const checkInMigration = fs.readFileSync(new URL("../supabase/migrations/20260907080000_hotel_atomic_checkin_transition.sql", import.meta.url), "utf8");
const housekeeping = fs.readFileSync(new URL("../app/(system)/workspace/[organizationId]/operations/housekeeping/page.jsx", import.meta.url), "utf8");
const bookingList = fs.readFileSync(new URL("../app/api/hotel/bookings/list/route.js", import.meta.url), "utf8");
const arrivalRuntime = fs.readFileSync(new URL("../lib/hotel/server/getHotelArrivalReadiness.js", import.meta.url), "utf8");
const bookingTransition = fs.readFileSync(new URL("../lib/hotel/server/transitionHotelBooking.js", import.meta.url), "utf8");

test("cleaning requires a governed QC stage before guest-ready inventory", () => {
  assert.match(transitionRuntime, /rpc\("hotel_transition_housekeeping_task"/);
  assert.match(transitionMigration, /v_next_room_status := 'CLEANING'/);
  assert.match(transitionMigration, /v_next_task_status := 'AWAITING_INSPECTION'/);
  assert.match(transitionMigration, /v_next_room_status := 'CLEAN'/);
  assert.match(transitionMigration, /Task must be AWAITING_INSPECTION before inspection outcome/);
  assert.match(transitionMigration, /set status = 'AVAILABLE'/);
});

test("non-room housekeeping work keeps the generic completion lifecycle", () => {
  assert.match(transitionMigration, /if v_task\.room_id is null then/);
  assert.match(transitionMigration, /v_next_task_status := 'IN_PROGRESS'/);
  assert.match(transitionMigration, /v_next_task_status := 'COMPLETED'/);
  assert.match(transitionMigration, /completed_at = case when v_next_task_status = 'COMPLETED'/);
});

test("housekeeping prioritizes arrival-blocking rooms and explicit inspection", () => {
  assert.match(housekeeping, /QC_BLOCKING_ARRIVAL/);
  assert.match(housekeeping, /QC BLOCKING ARRIVAL/);
  assert.match(housekeeping, /Inspect room/);
  assert.match(housekeeping, /Pass — release room/);
});

test("front desk receives turnover evidence while check-in remains AVAILABLE-only", () => {
  assert.match(bookingList, /room_turnover/);
  assert.match(bookingList, /AWAITING_INSPECTION/);
  assert.match(arrivalRuntime, /roomStatus !== "AVAILABLE"/);
  assert.match(bookingTransition, /rpc\("hotel_check_in_booking_guarded"/);
  assert.match(checkInMigration, /assigned room is no longer available/);
  assert.match(checkInMigration, /and status = 'AVAILABLE'/);
});
