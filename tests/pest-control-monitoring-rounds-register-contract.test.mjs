import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const ROOT = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, ROOT), "utf8");
}

test("monitoring rounds list uses organization-scoped read model instead of technician feed", async () => {
  const component = await source("components/workspace/operations/pest-control/PestControlMonitoringRounds.jsx");
  assert.match(component, /\/api\/service-management\/monitoring-rounds-register/);
  assert.doesNotMatch(component, /\/api\/service-management\/technician\?/);
});

test("monitoring rounds register reads canonical occurrences and governed work orders", async () => {
  const route = await source("app/api/service-management/monitoring-rounds-register/route.js");
  assert.match(route, /resolveServiceManagementContext/);
  assert.match(route, /listServiceOccurrences/);
  assert.match(route, /operations_records/);
  assert.match(route, /capability_id", "work-orders"/);
  assert.match(route, /organization_id", resolved\.context\.organization_id/);
  assert.match(route, /industry_key\) === "pest_control"/);
  assert.doesNotMatch(route, /export async function POST/);
});

test("technician feed remains isolated to the logged-in technician", async () => {
  const route = await source("app/api/service-management/technician/route.js");
  assert.match(route, /assignedToCurrentTechnician/);
  assert.match(route, /filter\(\(row\) => assignedToCurrentTechnician\(row, resolved\)\)/);
});
