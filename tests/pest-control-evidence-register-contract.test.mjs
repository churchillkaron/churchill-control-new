import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("Pest Control proof queue uses the supervisor evidence register", async () => {
  const hub = await source("components/workspace/operations/pest-control/PestControlEvidenceHub.jsx");
  assert.match(hub, /\/api\/service-management\/evidence-register\?organizationId=/);
  assert.doesNotMatch(hub, /\/api\/service-management\/technician\?organizationId=/);
});

test("evidence register is organization scoped and has no technician identity filter", async () => {
  const register = await source("app/api/service-management/evidence-register/route.js");
  assert.match(register, /listServiceOccurrences/);
  assert.match(register, /\.eq\("organization_id", resolved\.context\.organization_id\)/);
  assert.match(register, /capability_id", "completion-evidence"/);
  assert.doesNotMatch(register, /assignedToCurrentTechnician/);
  assert.doesNotMatch(register, /export async function POST/);
});

test("technician feed remains restricted to the current technician", async () => {
  const technician = await source("app/api/service-management/technician/route.js");
  assert.match(technician, /assignedToCurrentTechnician/);
  assert.match(technician, /workOrders = \(result\.data \|\| \[\]\)\.filter\(\(row\) => assignedToCurrentTechnician\(row, resolved\)\)/);
});
