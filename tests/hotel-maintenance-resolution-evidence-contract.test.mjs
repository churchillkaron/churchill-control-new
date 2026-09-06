import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync("supabase/migrations/20260906133000_hotel_maintenance_resolution_evidence.sql", "utf8");
const route = fs.readFileSync("app/api/hotel/maintenance/requests/route.js", "utf8");
const page = fs.readFileSync("app/(system)/workspace/[organizationId]/operations/maintenance/page.jsx", "utf8");

test("room maintenance resolution persists repair evidence", () => {
  assert.match(migration, /hotel_maintenance_resolution_events/);
  assert.match(migration, /hotel_transition_maintenance_request/);
  assert.match(migration, /REPAIRED/);
  assert.match(migration, /REPLACED/);
  assert.match(migration, /NO_FAULT_FOUND/);
  assert.match(migration, /Maintenance resolution notes are required/);
  assert.match(migration, /Critical or safety maintenance resolution requires evidence reference/);
});

test("maintenance transition is server governed and service-role only", () => {
  assert.match(migration, /security invoker/i);
  assert.match(migration, /revoke all on function public\.hotel_transition_maintenance_request[^;]+ from public/i);
  assert.match(migration, /from anon/i);
  assert.match(migration, /from authenticated/i);
  assert.match(migration, /grant execute on function public\.hotel_transition_maintenance_request[^;]+ to service_role/i);
  assert.match(route, /requireOrganizationAccess/);
  assert.match(route, /hotel_transition_maintenance_request/);
  assert.doesNotMatch(route, /\.update\(patch\)/);
});

test("maintenance cannot silently release the physical room", () => {
  assert.match(migration, /room_status_unchanged/);
  assert.doesNotMatch(migration, /update public\.hotel_rooms[\s\S]*set status = 'AVAILABLE'/i);
  assert.match(page, /Room stays blocked until all remaining readiness checks pass/);
});

test("maintenance UI requires a real repair lifecycle", () => {
  assert.match(page, /Start repair/);
  assert.match(page, /Repair outcome/);
  assert.match(page, /What was repaired \/ verified/);
  assert.match(page, /Evidence reference/);
  assert.match(page, /Record repair & resolve/);
  assert.match(page, /resolutionNotes\.trim/);
});

test("resolved room defects can be reopened without erasing repair history", () => {
  assert.match(migration, /REOPEN/);
  assert.match(migration, /Only a RESOLVED maintenance request can be reopened/);
  assert.match(migration, /Maintenance reopen reason is required/);
  assert.match(migration, /insert into public\.hotel_maintenance_resolution_events/);
  assert.match(route, /maintenance_events/);
  assert.match(route, /\["RESOLVE", "REOPEN"\]\.includes\(action\)/);
  assert.match(page, /Recent resolved room repairs/);
  assert.match(page, /Why reopen this repair/);
  assert.match(page, /Reopen defect/);
  assert.match(page, /Original repair evidence stays intact/);
});
