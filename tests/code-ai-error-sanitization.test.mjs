import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  isCodeAITransientInfrastructureError,
  sanitizeCodeAIErrorReason,
  sanitizedCodeAIErrorDetails,
} from "../lib/code/runtime/CodeAIErrorSanitizationRuntime.js";

const cloudflare521 = `<!DOCTYPE html><html><head><title>supabase.co | 521: Web server is down</title></head><body>Cloudflare Error code 521</body></html>`;

test("transient infrastructure HTML collapses to a compact stable code", () => {
  assert.equal(isCodeAITransientInfrastructureError(cloudflare521), true);
  const reason = sanitizeCodeAIErrorReason(cloudflare521, { label: "PLANNER" });
  assert.equal(reason, "CODE_AI_TRANSIENT_INFRASTRUCTURE_FAILURE:PLANNER:HTTP_521");
  assert.doesNotMatch(reason, /html|cloudflare|supabase\.co/i);
  assert.deepEqual(sanitizedCodeAIErrorDetails(new Error(cloudflare521)), {
    contract: "AVANTIQO_CODE_AI_ERROR_SANITIZATION_V1",
    transient_infrastructure_failure: true,
    raw_transport_payload_persisted: false,
  });
});

test("deterministic repository errors remain useful and bounded", () => {
  const reason = sanitizeCodeAIErrorReason(
    "CODE_AI_MISSING_READ_PATH_REPLAN_REQUIRED: tests/missing-file.mjs",
    { label: "REPOSITORY_OPERATION" },
  );
  assert.equal(
    reason,
    "CODE_AI_MISSING_READ_PATH_REPLAN_REQUIRED: tests/missing-file.mjs",
  );
});

test("all primary Code execution paths use the sanitizer before persisting failures", async () => {
  const mission = await readFile("lib/code/runtime/CodeAIMissionRuntime.js", "utf8");
  const live = await readFile("lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", "utf8");
  const autonomous = await readFile("lib/code/runtime/CodeAIAutonomousRuntime.js", "utf8");
  const v2 = await readFile("lib/code/runtime/CodeAIWorkPackageRuntimeV2.js", "utf8");
  const employee = await readFile("lib/code/runtime/CodeAIEmployeeRuntime.js", "utf8");
  const missionRoute = await readFile("app/api/operator/code/mission/route.js", "utf8");
  assert.match(mission, /sanitizeCodeAIErrorReason\(error/);
  assert.match(mission, /safeOperationReason/);
  assert.match(mission, /reason: safeOperationReason/);
  assert.match(mission, /sanitizedCodeAIErrorDetails\(error\)/);
  assert.match(mission, /evidence: bounded\(sanitizedCodeAIErrorDetails\(error\) \|\| null\)/);
  assert.match(live, /sanitizeCodeAIErrorReason\(error, \{ label: "PLANNER"/);
  assert.match(live, /const safeReason = sanitizeCodeAIErrorReason\(reason, \{/);
  assert.match(live, /label: "WORK_PACKAGE"/);
  assert.match(live, /blockers: \[safeReason\]/);
  assert.match(autonomous, /label: "AUTONOMOUS_PLANNER"/);
  assert.match(autonomous, /label: "GOVERNED_RESEARCH"/);
  assert.match(v2, /sanitizeCodeAIErrorReason/);
  assert.match(v2, /label: "WORK_PACKAGE_V2"/);
  assert.match(v2, /blockers: \[safeReason\]/);
  assert.match(employee, /label: "RUNTIME_EVIDENCE"/);
  assert.match(employee, /sanitizeCodeAIErrorReason\(error/);
  assert.match(missionRoute, /label: "MISSION_API"/);
  assert.match(missionRoute, /error: safeError/);
});
