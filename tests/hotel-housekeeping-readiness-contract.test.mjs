import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const transitionRuntime = fs.readFileSync(new URL("../lib/hotel/server/transitionHousekeepingTask.js", import.meta.url), "utf8");
const housekeeping = fs.readFileSync(new URL("../app/(system)/workspace/[organizationId]/operations/housekeeping/page.jsx", import.meta.url), "utf8");
const bookingList = fs.readFileSync(new URL("../app/api/hotel/bookings/list/route.js", import.meta.url), "utf8");
const arrivalRuntime = fs.readFileSync(new URL("../lib/hotel/server/getHotelArrivalReadiness.js", import.meta.url), "utf8");
const bookingTransition = fs.readFileSync(new URL("../lib/hotel/server/transitionHotelBooking.js", import.meta.url), "utf8");

test("cleaning requires a governed QC stage before guest-ready inventory", () => {
  assert.match(transitionRuntime, /roomStatus: "CLEANING"/);
  assert.match(transitionRuntime, /toStatus: "AWAITING_INSPECTION"/);
  assert.match(transitionRuntime, /roomStatus: "CLEAN"/);
  assert.match(transitionRuntime, /fromStatus: "AWAITING_INSPECTION"/);
  assert.match(transitionRuntime, /roomStatus: "AVAILABLE"/);
  assert.match(transitionRuntime, /Room state changed before housekeeping could complete this move/);
  assert.match(transitionRuntime, /restoreRoomState/);
});

test("non-cleaning housekeeping work keeps the generic completion lifecycle", () => {
  assert.match(transitionRuntime, /GENERIC_TRANSITIONS/);
  assert.match(transitionRuntime, /COMPLETE: Object\.freeze\(\{ fromStatus: "IN_PROGRESS", toStatus: "COMPLETED", completesTask: true \}\)/);
  assert.match(transitionRuntime, /cleaning \? CLEANING_TRANSITIONS : GENERIC_TRANSITIONS/);
});

test("housekeeping prioritizes arrival-blocking rooms and explicit inspection", () => {
  assert.match(housekeeping, /arrival_waiting/);
  assert.match(housekeeping, /QC required/);
  assert.match(housekeeping, /Inspect & release/);
  assert.match(housekeeping, /ARRIVAL WAITING/);
});

test("front desk receives turnover evidence while check-in remains AVAILABLE-only", () => {
  assert.match(bookingList, /room_turnover/);
  assert.match(bookingList, /AWAITING_INSPECTION/);
  assert.match(arrivalRuntime, /roomStatus !== "AVAILABLE"/);
  assert.match(bookingTransition, /Assigned room must be AVAILABLE before check-in/);
  assert.match(bookingTransition, /\.eq\("status", "AVAILABLE"\)/);
});
