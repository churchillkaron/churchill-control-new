import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync("supabase/migrations/20260906014500_hotel_guarded_room_assignment.sql", "utf8");
const optionsRuntime = fs.readFileSync("lib/hotel/server/getHotelRoomAssignmentOptions.js", "utf8");
const optionsRoute = fs.readFileSync("app/api/hotel/bookings/room-options/route.js", "utf8");
const assignRoute = fs.readFileSync("app/api/hotel/bookings/assign-room/route.js", "utf8");
const staysRoute = fs.readFileSync("app/api/hotel/stays/route.js", "utf8");
const roomControl = fs.readFileSync("components/workspace/hotel/HotelArrivalRoomControl.jsx", "utf8");
const frontDeskPage = fs.readFileSync("app/(system)/workspace/[organizationId]/operations/front-desk/page.jsx", "utf8");

test("guarded room assignment locks physical and reservation truth before mutation", () => {
  assert.match(migration, /hotel_assign_booking_room_guarded/);
  assert.match(migration, /from public\.hotel_bookings[\s\S]*for update/);
  assert.match(migration, /from public\.hotel_rooms[\s\S]*for update/);
  assert.match(migration, /max_guests/);
  assert.match(migration, /Target room capacity is insufficient/);
  assert.match(migration, /other_booking\.check_in_date < v_booking\.check_out_date/);
  assert.match(migration, /Target room is already committed to an overlapping stay/);
  assert.match(migration, /hotel_maintenance_requests/);
  assert.match(migration, /Target room has unresolved maintenance work/);
});

test("arrival due now is property-day authoritative and requires physical readiness", () => {
  assert.match(migration, /business_day_cutoff_minutes/);
  assert.match(migration, /operational_day_configured_at/);
  assert.match(migration, /timezone\(v_property_timezone, v_now\)/);
  assert.match(migration, /v_booking\.check_in_date <= v_business_date/);
  assert.match(migration, /v_require_ready := true/);
  assert.match(migration, /upper\(coalesce\(v_room\.status, ''\)\) <> 'AVAILABLE'/);
  assert.match(migration, /hotel_housekeeping_tasks/);
  assert.match(migration, /PENDING', 'IN_PROGRESS', 'AWAITING_INSPECTION/);
});

test("in-house room move creates turnover using the real housekeeping schema", () => {
  assert.match(migration, /task_status,[\s\S]*priority,[\s\S]*task_date,[\s\S]*notes/);
  assert.doesNotMatch(migration, /booking_id,[\s\S]*task_status,[\s\S]*scheduled_at/);
  assert.match(migration, /coalesce\(v_business_date, v_task_date\)/);
});

test("room recommendations are explainable and use the same hard safety concepts", () => {
  assert.match(optionsRuntime, /getHotelOperationalDate/);
  assert.match(optionsRuntime, /CAPACITY/);
  assert.match(optionsRuntime, /MAINTENANCE/);
  assert.match(optionsRuntime, /OVERLAP/);
  assert.match(optionsRuntime, /HOUSEKEEPING/);
  assert.match(optionsRuntime, /readyNow/);
  assert.match(optionsRuntime, /assignableNow/);
  assert.match(optionsRuntime, /capacityWaste: spare >= 0 \? spare : 999/);
  assert.match(optionsRuntime, /whyRecommended/);
});

test("room option and assignment APIs resolve organization authority from the booking", () => {
  assert.match(optionsRoute, /select\("id,organization_id"\)/);
  assert.match(optionsRoute, /requireOrganizationAccess\(\{ organizationId: booking\.organization_id, request \}\)/);
  assert.match(assignRoute, /select\("id,organization_id,status,room_id"\)/);
  assert.match(assignRoute, /getHotelRoomAssignmentOptions/);
  assert.match(assignRoute, /option\.assignableNow/);
  assert.match(assignRoute, /hotel_assign_booking_room_guarded/);
  assert.match(assignRoute, /recommendationRecheckedBeforeWrite: true/);
  assert.match(assignRoute, /assignmentRecheckedAtomically: true/);
});

test("legacy Stay Control no longer performs direct room assignment writes", () => {
  assert.match(staysRoute, /hotel_assign_booking_room_guarded/);
  assert.doesNotMatch(staysRoute, /booking_id: booking\.id,[\s\S]*scheduled_at: now/);
  const assignmentBlock = staysRoute.match(/if \(action === "ASSIGN_ROOM" \|\| action === "MOVE_ROOM"\) \{([\s\S]*?)\n    \}/)?.[1] || "";
  assert.doesNotMatch(assignmentBlock, /from\("hotel_bookings"\)\.update/);
  assert.doesNotMatch(assignmentBlock, /from\("hotel_rooms"\)\.update/);
});

test("Front Desk surfaces a proactive recommendation but requires a human assignment", () => {
  assert.match(frontDeskPage, /HotelArrivalRoomControl/);
  assert.match(roomControl, /Best safe room/);
  assert.match(roomControl, /Why this room/);
  assert.match(roomControl, /What blocks/);
  assert.match(roomControl, /Assign selected room/);
  assert.match(roomControl, /\/api\/hotel\/bookings\/room-options/);
  assert.match(roomControl, /\/api\/hotel\/bookings\/assign-room/);
  assert.doesNotMatch(roomControl, /useEffect\([^)]*assign\(/);
});
