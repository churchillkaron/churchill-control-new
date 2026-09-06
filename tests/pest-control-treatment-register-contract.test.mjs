import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const registerRoutePath = new URL("../app/api/service-management/treatment-register/route.js", import.meta.url);
const technicianRoutePath = new URL("../app/api/service-management/technician/route.js", import.meta.url);
const treatmentHubPath = new URL("../components/workspace/operations/pest-control/PestControlTreatmentHub.jsx", import.meta.url);

async function source(path) {
  return readFile(path, "utf8");
}

test("supervisor treatment register reads canonical occurrences and work orders", async () => {
  const route = await source(registerRoutePath);
  assert.match(route, /listServiceOccurrences/);
  assert.match(route, /capability_id",\s*"work-orders"/);
  assert.match(route, /projectServiceTreatmentReadiness/);
  assert.doesNotMatch(route, /export async function POST/);
});

test("treatment register does not depend on personal technician cockpit feed", async () => {
  const hub = await source(treatmentHubPath);
  assert.match(hub, /\/api\/service-management\/treatment-register/);
  assert.doesNotMatch(hub, /\/api\/service-management\/technician\?/);
});

test("technician feed remains restricted to current assigned technician", async () => {
  const route = await source(technicianRoutePath);
  assert.match(route, /assignedToCurrentTechnician/);
  assert.match(route, /workOrders = \(result\.data \|\| \[\]\)\.filter\(\(row\) => assignedToCurrentTechnician\(row, resolved\)\)/);
});
