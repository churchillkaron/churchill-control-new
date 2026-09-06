import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync("supabase/migrations/20260906032000_hotel_atomic_housekeeping_transition.sql", "utf8");
const route = fs.readFileSync("app/api/hotel/housekeeping/restore-arrival-work/route.js", "utf8");
const ownership = fs.readFileSync("lib/hotel/server/getHotelArrivalReadinessOwnership.js", "utf8");

test("missing Housekeeping ownership has a governed atomic repair boundary", () => {
  assert.match(ownership, /HOUSEKEEPING_TASK_MISSING/);
  assert.match(ownership, /CREATE_HOUSEKEEPING_WORK/);
  assert.match(migration, /hotel_restore_housekeeping_work_for_arrival/);
  assert.match(migration, /for update/);
  assert.match(migration, /Property operational day must be configured before Housekeeping recovery/);
  assert.match(migration, /Arrival is not due on the property business day/);
  assert.match(migration, /Maintenance now owns this room-readiness blocker/);
  assert.match(migration, /when 'DIRTY' then 'PENDING'/);
  assert.match(migration, /when 'CLEANING' then 'IN_PROGRESS'/);
  assert.match(migration, /when 'CLEAN' then 'AWAITING_INSPECTION'/);
});

test("Housekeeping recovery is service-role only and server-authorized", () => {
  assert.match(migration, /security invoker/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /revoke all on function public\.hotel_restore_housekeeping_work_for_arrival\(uuid, uuid\) from public/);
  assert.match(migration, /grant execute on function public\.hotel_restore_housekeeping_work_for_arrival\(uuid, uuid\) to service_role/);
  assert.match(route, /requireOrganizationAccess/);
  assert.match(route, /p_organization_id: access\.organizationId/);
  assert.match(route, /hotel_restore_housekeeping_work_for_arrival/);
});

test("recovery refuses to create duplicate active Housekeeping work", () => {
  assert.match(migration, /in \('PENDING', 'IN_PROGRESS', 'AWAITING_INSPECTION'\)/);
  assert.match(migration, /if found then\s+return v_task/);
  assert.match(route, /duplicateActiveWorkPrevented: true/);
});
