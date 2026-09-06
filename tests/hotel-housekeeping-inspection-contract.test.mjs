import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync("supabase/migrations/20260906032000_hotel_atomic_housekeeping_transition.sql", "utf8");
const route = fs.readFileSync("app/api/hotel/housekeeping/inspect/route.js", "utf8");
const housekeeping = fs.readFileSync("app/(system)/workspace/[organizationId]/operations/housekeeping/page.jsx", "utf8");

test("inspection evidence is server-owned and room release is fail-closed", () => {
  assert.match(migration, /hotel_housekeeping_inspections/);
  assert.match(migration, /outcome in \('PASS', 'RECLEAN', 'MAINTENANCE'\)/);
  assert.match(migration, /hotel_inspect_housekeeping_task/);
  assert.match(migration, /security invoker/i);
  assert.match(migration, /revoke all on function public\.hotel_inspect_housekeeping_task/);
  assert.match(migration, /grant execute on function public\.hotel_inspect_housekeeping_task[\s\S]*service_role/);
});

test("PASS is the only QC outcome that releases the room", () => {
  const passIndex = migration.indexOf("if v_outcome = 'PASS'");
  const availableIndex = migration.indexOf("status = 'AVAILABLE'", passIndex);
  assert.ok(passIndex >= 0 && availableIndex > passIndex);
  assert.match(migration, /Room still has unresolved maintenance and cannot pass inspection/);
  assert.match(migration, /Room still has another active Housekeeping task and cannot pass inspection/);
  assert.match(migration, /Room is still assigned to an in-house stay and cannot pass inspection/);
});

test("RECLEAN returns the same task to Housekeeping without releasing the room", () => {
  assert.match(migration, /elsif v_outcome = 'RECLEAN'[\s\S]*status = 'DIRTY'[\s\S]*task_status = 'PENDING'/);
});

test("MAINTENANCE creates or reuses canonical room defect and preserves QC gate", () => {
  assert.match(migration, /insert into public\.hotel_maintenance_requests/);
  assert.match(migration, /v_maintenance_request_id/);
  assert.match(migration, /Keep the room CLEAN but blocked and keep this QC task awaiting inspection/);
  assert.doesNotMatch(migration, /elsif v_outcome = 'MAINTENANCE'[\s\S]*task_status = 'COMPLETED'/);
});

test("legacy one-click INSPECT is rejected by transition RPC", () => {
  assert.match(migration, /elsif v_action = 'INSPECT'[\s\S]*Use governed Housekeeping inspection outcome/);
});

test("inspection API reauthorizes task organization and records inspector identity", () => {
  assert.match(route, /requireOrganizationAccess/);
  assert.match(route, /hotel_inspect_housekeeping_task/);
  assert.match(route, /p_inspector_staff_account_id: access\.access\?\.staffAccountId/);
  assert.match(route, /inspectionEvidencePersistedAtomically: true/);
});

test("Housekeeping UI exposes pass, reclean and maintenance outcomes", () => {
  assert.match(housekeeping, /Pass — release room/);
  assert.match(housekeeping, /Fail — reclean/);
  assert.match(housekeeping, /Fail — maintenance/);
  assert.match(housekeeping, /\/api\/hotel\/housekeeping\/inspect/);
  assert.match(housekeeping, /Pass is the only outcome that can release the room/);
  assert.doesNotMatch(housekeeping, /transition\(task\.id, "INSPECT"\)/);
});
