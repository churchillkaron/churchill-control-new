import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const ownership = fs.readFileSync("lib/hotel/server/getHotelArrivalReadinessOwnership.js", "utf8");
const ownershipRoute = fs.readFileSync("app/api/hotel/arrival-readiness/ownership/route.js", "utf8");
const ownershipBoard = fs.readFileSync("components/workspace/hotel/HotelArrivalReadinessOwnership.jsx", "utf8");
const frontDesk = fs.readFileSync("app/(system)/workspace/[organizationId]/operations/front-desk/page.jsx", "utf8");
const housekeeping = fs.readFileSync("app/(system)/workspace/[organizationId]/operations/housekeeping/page.jsx", "utf8");
const maintenance = fs.readFileSync("app/(system)/workspace/[organizationId]/operations/maintenance/page.jsx", "utf8");
const maintenanceRequestsRoute = fs.readFileSync("app/api/hotel/maintenance/requests/route.js", "utf8");
const roomOptions = fs.readFileSync("lib/hotel/server/getHotelRoomAssignmentOptions.js", "utf8");
const roomAssignmentMigration = fs.readFileSync("supabase/migrations/20260906014500_hotel_guarded_room_assignment.sql", "utf8");

test("arrival ownership is derived live and not persisted as another queue", () => {
  assert.match(ownership, /hotel_bookings/);
  assert.match(ownership, /hotel_rooms/);
  assert.match(ownership, /hotel_housekeeping_tasks/);
  assert.match(ownership, /hotel_maintenance_requests/);
  assert.match(ownership, /FRONT_DESK/);
  assert.match(ownership, /HOUSEKEEPING/);
  assert.match(ownership, /MAINTENANCE/);
  assert.doesNotMatch(ownership, /insert\(/i);
  assert.doesNotMatch(ownership, /update\(/i);
});

test("arrival due truth uses configured property operational day only", () => {
  assert.match(ownership, /getHotelOperationalDate/);
  assert.match(ownership, /operational\?\.configured/);
  assert.match(ownership, /booking\.check_in_date.*operational\.businessDate/s);
  assert.match(ownership, /Arrival ownership will not infer a due-today queue from server or browser time/);
  assert.doesNotMatch(ownership, /toISOString\(\)\.slice\(0, 10\)/);
});

test("owner precedence gives physical defects to Maintenance before Housekeeping", () => {
  const maintenanceIndex = ownership.indexOf("if (maintenance)");
  const housekeepingIndex = ownership.indexOf("else if (activeHousekeeping)");
  assert.ok(maintenanceIndex >= 0 && housekeepingIndex > maintenanceIndex);
  assert.match(ownership, /HOUSEKEEPING_TASK_MISSING/);
  assert.match(ownership, /ROOM_UNASSIGNED/);
  assert.match(ownership, /MOVE_OR_INVESTIGATE_ROOM/);
});

test("ownership API re-authorizes organization scope on the server", () => {
  assert.match(ownershipRoute, /requireOrganizationAccess/);
  assert.match(ownershipRoute, /organizationId: access\.organizationId/);
  assert.match(ownershipRoute, /getHotelArrivalReadinessOwnership/);
});

test("the same ownership board is visible to Front Desk, Housekeeping and Maintenance", () => {
  assert.match(frontDesk, /HotelArrivalReadinessOwnership/);
  assert.match(frontDesk, /focusOwner="FRONT_DESK"/);
  assert.match(housekeeping, /HotelArrivalReadinessOwnership/);
  assert.match(housekeeping, /focusOwner="HOUSEKEEPING"/);
  assert.match(maintenance, /HotelArrivalReadinessOwnership/);
  assert.match(maintenance, /focusOwner="MAINTENANCE"/);
  assert.match(ownershipBoard, /Who owns every blocked arrival/);
  assert.match(ownershipBoard, /there is no duplicate queue to maintain/);
});

test("Maintenance workspace operates canonical room blockers separately from planned work", () => {
  assert.match(maintenance, /Room defects blocking release/);
  assert.match(maintenance, /\/api\/hotel\/maintenance\/requests/);
  assert.match(maintenance, /Planned maintenance/);
  assert.match(maintenance, /Resolve defect/);
  assert.match(maintenanceRequestsRoute, /hotel_maintenance_requests/);
  assert.match(maintenanceRequestsRoute, /status: "RESOLVED"/);
  assert.match(maintenanceRequestsRoute, /resolved_at: now/);
  assert.match(maintenanceRequestsRoute, /requireOrganizationAccess/);
});

test("room assignment and ownership read the live maintenance request schema", () => {
  assert.match(roomOptions, /issue_title/);
  assert.doesNotMatch(roomOptions, /hotel_maintenance_requests[\s\S]*\.eq\("property_id"/);
  assert.doesNotMatch(roomOptions, /select\("id,room_id,status,priority,title/);
  assert.doesNotMatch(roomAssignmentMigration, /mr\.property_id/);
  assert.match(roomAssignmentMigration, /mr\.room_id = p_room_id/);
});
