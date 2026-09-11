import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/service-management/runtime/ServicePlanRuntime.js", "utf8");
const route = fs.readFileSync("app/api/service-management/plans/[planId]/status/route.js", "utf8");

test("service plan pause/resume route imports a real runtime export", () => {
  assert.match(source, /export async function setServicePlanStatus/);
  assert.match(route, /import \{ setServicePlanStatus \}/);
});

test("pause/resume status endpoint cannot become a generic lifecycle status backdoor", () => {
  assert.match(source, /\["active", "paused"\]\.includes\(normalizedStatus\)/);
  assert.match(source, /cannot transition from .* through recurring pause\/resume/);
  assert.match(source, /values: \{ status: normalizedStatus \}/);
});

test("pause/resume remains organization-scoped and idempotent", () => {
  assert.match(source, /organizationId: runtimeContext\.organization_id/);
  assert.match(source, /if \(plan\.status === normalizedStatus\) return plan/);
});
