import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync("supabase/migrations/20260906135200_hotel_readiness_realtime_authorization.sql", "utf8");
const bridge = fs.readFileSync("components/workspace/hotel/HotelRealtimeReadinessBridge.jsx", "utf8");
const shell = fs.readFileSync("components/workspace/hotel/HotelWorkspaceUI.jsx", "utf8");
const broadcaster = fs.readFileSync("lib/hotel/server/broadcastHotelReadinessChanged.js", "utf8");
const housekeeping = fs.readFileSync("app/api/hotel/housekeeping/update/route.js", "utf8");
const inspection = fs.readFileSync("app/api/hotel/housekeeping/inspect/route.js", "utf8");
const recovery = fs.readFileSync("app/api/hotel/housekeeping/restore-arrival-work/route.js", "utf8");
const maintenance = fs.readFileSync("app/api/hotel/maintenance/requests/route.js", "utf8");
const assignment = fs.readFileSync("app/api/hotel/bookings/assign-room/route.js", "utf8");
const checkIn = fs.readFileSync("app/api/hotel/bookings/check-in/route.js", "utf8");
const checkOut = fs.readFileSync("app/api/hotel/bookings/check-out/route.js", "utf8");
const extension = fs.readFileSync("app/api/hotel/bookings/extend/route.js", "utf8");
const noShow = fs.readFileSync("app/api/hotel/bookings/no-show/route.js", "utf8");
const earlyDeparture = fs.readFileSync("app/api/hotel/bookings/early-departure/route.js", "utf8");
const stayControl = fs.readFileSync("app/api/hotel/stays/route.js", "utf8");
const frontDesk = fs.readFileSync("components/workspace/hotel/HotelFrontDeskWorkBoard.jsx", "utf8");

test("Hotel readiness Realtime is receive-only and organization scoped", () => {
  assert.match(migration, /on realtime\.messages\s+for select\s+to authenticated/i);
  assert.match(migration, /realtime\.messages\.extension = 'broadcast'/);
  assert.match(migration, /split_part\(\(select realtime\.topic\(\)\), ':', 1\) = 'hotel'/);
  assert.match(migration, /split_part\(\(select realtime\.topic\(\)\), ':', 3\) = 'readiness'/);
  assert.match(migration, /public\.same_organization/);
  assert.doesNotMatch(migration, /for insert\s+to authenticated/i);
});

test("browser bridge uses authenticated private Broadcast only as invalidation", () => {
  assert.match(bridge, /realtime\.setAuth\(\)/);
  assert.match(bridge, /config: \{ private: true \}/);
  assert.match(bridge, /readiness_changed/);
  assert.match(bridge, /HOTEL_READINESS_CHANGED_EVENT/);
  assert.match(bridge, /visibilitychange/);
  assert.match(bridge, /window\.addEventListener\("focus"/);
  assert.match(bridge, /FALLBACK_MIN_INTERVAL_MS/);
  assert.doesNotMatch(bridge, /\.from\("hotel_/);
  assert.doesNotMatch(bridge, /channel\.send\(/);
});

test("server readiness payload carries no operational record identifiers", () => {
  assert.match(broadcaster, /event: "readiness_changed"/);
  assert.match(broadcaster, /source: clean\(source\)/);
  assert.match(broadcaster, /action: clean\(action\)/);
  assert.doesNotMatch(broadcaster, /bookingId|booking_id|roomId|room_id|guestId|guest_id|requestId|request_id|taskId|task_id/);
});

test("shared Hotel shell revalidates the whole work surface without a hard reload", () => {
  assert.match(shell, /HotelRealtimeReadinessBridge/);
  assert.match(shell, /HOTEL_READINESS_CHANGED_EVENT/);
  assert.match(shell, /setReadinessRevision/);
  assert.match(shell, /key=\{readinessRevision\}/);
  assert.doesNotMatch(shell, /window\.location\.reload/);
});

test("room-readiness mutation boundaries broadcast only after governed writes", () => {
  for (const source of [housekeeping, inspection, recovery, maintenance, assignment]) {
    assert.match(source, /broadcastHotelReadinessChanged/);
  }

  assert.ok(housekeeping.indexOf("transitionHousekeepingTask") < housekeeping.lastIndexOf("broadcastHotelReadinessChanged"));
  assert.ok(inspection.indexOf('rpc("hotel_inspect_housekeeping_task"') < inspection.lastIndexOf("broadcastHotelReadinessChanged"));
  assert.ok(recovery.indexOf('rpc("hotel_restore_housekeeping_work_for_arrival"') < recovery.lastIndexOf("broadcastHotelReadinessChanged"));
  assert.ok(maintenance.indexOf('rpc("hotel_transition_maintenance_request"') < maintenance.lastIndexOf("broadcastHotelReadinessChanged"));
  assert.ok(assignment.indexOf('rpc("hotel_assign_booking_room_guarded"') < assignment.lastIndexOf("broadcastHotelReadinessChanged"));
});

test("live Front Desk mutations invalidate other Hotel devices after governed writes", () => {
  for (const source of [checkIn, checkOut, extension, noShow, earlyDeparture, stayControl]) {
    assert.match(source, /broadcastHotelReadinessChanged/);
  }

  assert.ok(checkIn.indexOf("transitionHotelBooking") < checkIn.lastIndexOf("broadcastHotelReadinessChanged"));
  assert.ok(checkOut.indexOf("transitionHotelBooking") < checkOut.lastIndexOf("broadcastHotelReadinessChanged"));
  assert.ok(extension.indexOf('rpc(\n      "hotel_extend_checked_in_stay_guarded"') < extension.lastIndexOf("broadcastHotelReadinessChanged"));
  assert.ok(noShow.indexOf('status: "NO_SHOW"') < noShow.lastIndexOf("broadcastHotelReadinessChanged"));

  assert.ok(earlyDeparture.indexOf('early_departure_review_status: "REVIEW_REQUIRED"') < earlyDeparture.indexOf('action: "EARLY_DEPARTURE_PREPARE"'));
  assert.ok(earlyDeparture.indexOf('early_departure_review_status: "CONFIRMED"') < earlyDeparture.indexOf('action: "EARLY_DEPARTURE_CONFIRM"'));

  assert.match(frontDesk, /hotelApi\("\/api\/hotel\/stays"/);
  assert.ok(stayControl.indexOf('rpc("hotel_assign_booking_room_guarded"') < stayControl.indexOf('source: "stay-control-room-assignment"'));
  assert.ok(stayControl.indexOf('from("hotel_folio_lines").insert') < stayControl.indexOf('action: "ADD_FOLIO_LINE"'));
  assert.ok(stayControl.indexOf('update({ status: "CLOSED"') < stayControl.indexOf('action: "CLOSE_FOLIO"'));
});
