import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const planner = fs.readFileSync("lib/hotel/server/getHotelHousekeepingPriorityPlan.js", "utf8");
const priorityRoute = fs.readFileSync("app/api/hotel/housekeeping/priority-plan/route.js", "utf8");
const transitionRuntime = fs.readFileSync("lib/hotel/server/transitionHousekeepingTask.js", "utf8");
const updateRoute = fs.readFileSync("app/api/hotel/housekeeping/update/route.js", "utf8");
const page = fs.readFileSync("app/(system)/workspace/[organizationId]/operations/housekeeping/page.jsx", "utf8");
const roomAssignmentMigration = fs.readFileSync("supabase/migrations/20260906014500_hotel_guarded_room_assignment.sql", "utf8");
const transitionMigration = fs.readFileSync("supabase/migrations/20260906032000_hotel_atomic_housekeeping_transition.sql", "utf8");

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

test("priority API re-authorizes organization scope on the server", () => {
  assert.match(priorityRoute, /requireOrganizationAccess/);
  assert.match(priorityRoute, /organizationId: access\.organizationId/);
  assert.match(priorityRoute, /getHotelHousekeepingPriorityPlan/);
});

test("Housekeeping task and room transitions are one atomic database operation", () => {
  assert.match(transitionMigration, /hotel_transition_housekeeping_task/);
  assert.match(transitionMigration, /from public\.hotel_housekeeping_tasks[\s\S]*for update/);
  assert.match(transitionMigration, /from public\.hotel_rooms[\s\S]*for update/);
  assert.match(transitionMigration, /update public\.hotel_rooms/);
  assert.match(transitionMigration, /update public\.hotel_housekeeping_tasks/);
  assert.match(transitionMigration, /security invoker/);
  assert.match(transitionMigration, /set search_path = ''/);
  assert.match(transitionMigration, /grant execute on function public\.hotel_transition_housekeeping_task[\s\S]*to service_role/);
});

test("inspection rechecks every physical release blocker inside the transaction", () => {
  assert.match(transitionMigration, /unresolved or unclassified maintenance/);
  assert.match(transitionMigration, /another active Housekeeping task/);
  assert.match(transitionMigration, /in-house stay/);
  assert.match(transitionMigration, /v_next_room_status := 'AVAILABLE'/);
});

test("server runtime delegates Housekeeping mutation to the atomic RPC only", () => {
  assert.match(transitionRuntime, /rpc\("hotel_transition_housekeeping_task"/);
  assert.doesNotMatch(transitionRuntime, /\.from\("hotel_rooms"\)/);
  assert.doesNotMatch(transitionRuntime, /\.from\("hotel_housekeeping_tasks"\)\.update/);
  assert.doesNotMatch(transitionRuntime, /restoreRoomState/);
  assert.match(updateRoute, /transitionHousekeepingTask/);
});

test("Housekeeping UI remains human-controlled", () => {
  assert.match(page, /What Housekeeping should do next/);
  assert.match(page, /Start cleaning/);
  assert.match(page, /Mark clean/);
  assert.match(page, /Inspect & release/);
  assert.match(page, /Resolve maintenance/);
  assert.match(page, /\/api\/hotel\/housekeeping\/priority-plan/);
});

test("guarded room assignment migration uses invoker authority only", () => {
  assert.match(roomAssignmentMigration, /security invoker/);
  assert.match(roomAssignmentMigration, /set search_path = ''/);
  assert.doesNotMatch(roomAssignmentMigration, /security definer/);
});
