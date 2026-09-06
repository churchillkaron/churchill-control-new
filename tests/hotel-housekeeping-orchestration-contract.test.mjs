import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const planner = fs.readFileSync("lib/hotel/server/getHotelHousekeepingPriorityPlan.js", "utf8");
const priorityRoute = fs.readFileSync("app/api/hotel/housekeeping/priority-plan/route.js", "utf8");
const transitionRuntime = fs.readFileSync("lib/hotel/server/transitionHousekeepingTask.js", "utf8");
const updateRoute = fs.readFileSync("app/api/hotel/housekeeping/update/route.js", "utf8");
const page = fs.readFileSync("app/(system)/workspace/[organizationId]/operations/housekeeping/page.jsx", "utf8");
const roomAssignmentMigration = fs.readFileSync("supabase/migrations/20260906014500_hotel_guarded_room_assignment.sql", "utf8");

test("Housekeeping priority is derived from governed live operational evidence", () => {
  assert.match(planner, /getHotelOperationalDate/);
  assert.match(planner, /estimated_arrival_at/);
  assert.match(planner, /vip_status/);
  assert.match(planner, /hotel_maintenance_requests/);
  assert.match(planner, /AWAITING_INSPECTION/);
  assert.match(planner, /GUEST_DUE_NOW/);
  assert.match(planner, /ARRIVAL_WITHIN_60_MIN/);
  assert.match(planner, /QC_BLOCKING_ARRIVAL/);
  assert.match(planner, /Property operational day is not configured\/applied/);
  assert.doesNotMatch(planner, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
});

test("Housekeeping planner uses the live task and maintenance schemas", () => {
  assert.match(planner, /id,organization_id,room_id,assigned_to,task_status,priority,task_date,notes,completed_at,created_at,updated_at/);
  assert.match(planner, /id,room_id,priority,status,issue_title,created_at/);
  assert.doesNotMatch(planner, /id,property_id,room_id,priority,status,issue_title/);
  assert.doesNotMatch(planner, /select\("[^\"]*task_type/);
  assert.doesNotMatch(planner, /select\("[^\"]*scheduled_at/);
});

test("priority API re-authorizes organization scope on the server", () => {
  assert.match(priorityRoute, /requireOrganizationAccess/);
  assert.match(priorityRoute, /organizationId: access\.organizationId/);
  assert.match(priorityRoute, /getHotelHousekeepingPriorityPlan/);
});

test("Housekeeping transitions no longer depend on phantom schema columns", () => {
  assert.match(transitionRuntime, /Boolean\(task\?\.room_id\)/);
  assert.match(transitionRuntime, /task_date/);
  assert.doesNotMatch(transitionRuntime, /select\("[^\"]*task_type/);
  assert.doesNotMatch(transitionRuntime, /select\("[^\"]*scheduled_at/);
  assert.match(updateRoute, /transitionHousekeepingTask/);
});

test("inspection cannot release a room while maintenance truth is unresolved or unknown", () => {
  assert.match(transitionRuntime, /TERMINAL_MAINTENANCE/);
  assert.match(transitionRuntime, /requireMaintenanceClearForRelease/);
  assert.match(transitionRuntime, /unresolved or unclassified maintenance/);
  assert.match(transitionRuntime, /transition\.roomStatus === "AVAILABLE"/);
});

test("Housekeeping UI is a human-controlled clean-next and inspect-next workboard", () => {
  assert.match(page, /What Housekeeping should do next/);
  assert.match(page, /Arrival critical/);
  assert.match(page, /Maintenance blocked/);
  assert.match(page, /Inspect next/);
  assert.match(page, /Guest due now/);
  assert.match(page, /Property operational-day configuration is not yet applied/);
  assert.match(page, /Start cleaning/);
  assert.match(page, /Mark clean/);
  assert.match(page, /Inspect & release/);
  assert.match(page, /Resolve maintenance/);
  assert.match(page, /\/api\/hotel\/housekeeping\/priority-plan/);
  assert.doesNotMatch(page, /\/api\/hotel\/housekeeping\/list/);
  assert.doesNotMatch(page, /new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/);
});

test("guarded room assignment migration uses invoker authority only", () => {
  assert.match(roomAssignmentMigration, /security invoker/);
  assert.match(roomAssignmentMigration, /set search_path = ''/);
  assert.doesNotMatch(roomAssignmentMigration, /security definer/);
  assert.match(roomAssignmentMigration, /grant execute on function public\.hotel_assign_booking_room_guarded[\s\S]*to service_role/);
});
