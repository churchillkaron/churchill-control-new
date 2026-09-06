import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const technicianRoutePath = new URL("../app/api/service-management/technician/route.js", import.meta.url);
const eligibilityRuntimePath = new URL("../lib/service-management/runtime/ServiceTechnicianEligibilityRuntime.js", import.meta.url);
const candidateRoutePath = new URL("../app/api/service-management/assignment-candidates/route.js", import.meta.url);
const servicePlanRuntimePath = new URL("../lib/service-management/runtime/ServicePlanRuntime.js", import.meta.url);

async function source(path) {
  return readFile(path, "utf8");
}

test("service-plan generated work snapshots treatment protocol qualification requirements", async () => {
  const runtime = await source(servicePlanRuntimePath);
  assert.match(runtime, /execution_protocol:\s*executionProtocol/);
  assert.match(runtime, /required_qualification_codes/);
});

test("dispatch candidate ranking consumes People qualification authority", async () => {
  const route = await source(candidateRoutePath);
  assert.match(route, /loadQualificationEvidence/);
  assert.match(route, /requiredQualificationCodesFromService/);
  assert.match(route, /BLOCKED_UNQUALIFIED/);
  assert.match(route, /BLOCKED_QUALIFICATION_CONFIG/);
  assert.match(route, /selectable:\s*!dispatchReadiness\.startsWith\("BLOCKED_"\)/);
});

test("technician execution revalidates identity and qualification at start and completion", async () => {
  const route = await source(technicianRoutePath);
  const runtime = await source(eligibilityRuntimePath);

  assert.match(route, /assertServiceTechnicianEligibility/);
  assert.match(route, /const technicianEligibility = await assertServiceTechnicianEligibility/);
  assert.match(route, /qualification_preflight:\s*technicianEligibility/);
  assert.match(route, /assignedToCurrentTechnician/);

  assert.match(runtime, /Only the technician currently assigned to this visit can execute it/);
  assert.match(runtime, /REQUIREMENT_NOT_CONFIGURED/);
  assert.match(runtime, /BLOCKED_UNQUALIFIED/);
  assert.match(runtime, /requiredQualificationCodesFromService/);
});
