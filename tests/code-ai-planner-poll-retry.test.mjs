import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { executeCodeAIPlannerRequest } from "../lib/code/runtime/CodeAIPlannerExecutionRuntime.js";

function deterministicUsageId(missionId, iteration, recoveryCount = 0) {
  const digest = createHash("sha256")
    .update(`AVANTIQO_CODE_AI_PLANNER_USAGE_ID_V1:${missionId}:${iteration}:recovery:${recoveryCount}`)
    .digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join("-");
}

test("transient 521 while settling a pending planner job retries the same job without re-execution", async () => {
  let executeCalls = 0;
  let settleCalls = 0;
  const providerJobId = "external-provider-job-123";
  const missionId = "mission-test";
  const iteration = 2;
  const usageId = deterministicUsageId(missionId, iteration);
  const serviceRuntime = {
    async execute() {
      executeCalls += 1;
      throw new Error("execute must not be called while resuming the same pending job");
    },
    async settle(input) {
      settleCalls += 1;
      assert.equal(input.provider_job_id, providerJobId);
      if (settleCalls === 1) {
        throw new Error("<!DOCTYPE html><title>521: Web server is down</title> Cloudflare");
      }
      return {
        success: true,
        pending: false,
        output: { result: '{"contract":"AVANTIQO_CODE_AI_WORK_PACKAGE_V1","phase":"review","operations":[{"action":"diff","input":{}}]}' },
      };
    },
  };

  const result = await executeCodeAIPlannerRequest({
    execution_input: {
      organization_id: "org-test",
      capability: "ai.code.debug",
      input: { capability: "ai.code.debug", instruction: "continue", quantity: 1 },
      metadata: { code_ai_mission_id: "mission-test", code_ai_iteration: 2 },
    },
    pending_execution: {
      contract: "AVANTIQO_CODE_AI_PLANNER_EXECUTION_V2",
      organization_id: "org-test",
      provider: "test-provider",
      provider_job_id: providerJobId,
      usage_id: usageId,
      pricing: {},
      quantity: 1,
      unit: "request",
      metadata: { code_ai_mission_id: "mission-test", code_ai_iteration: 2 },
      credential_id: null,
      started_at: new Date().toISOString(),
    },
    service_runtime: serviceRuntime,
    poll_interval_ms: 250,
    poll_window_ms: 2500,
  });

  assert.equal(result.success, true);
  assert.equal(result.pending, false);
  assert.equal(executeCalls, 0);
  assert.equal(settleCalls, 2);
  assert.match(result.output, /AVANTIQO_CODE_AI_WORK_PACKAGE_V1/);
});


test("pending planner resume rejects another mission before settlement", async () => {
  const missionId = "mission-current";
  const iteration = 3;
  const serviceRuntime = {
    async execute() { throw new Error("execute must not run"); },
    async settle() { throw new Error("settle must not run"); },
  };
  await assert.rejects(
    executeCodeAIPlannerRequest({
      execution_input: {
        organization_id: "org-test",
        capability: "ai.code.debug",
        input: { capability: "ai.code.debug", instruction: "continue", quantity: 1 },
        metadata: { code_ai_mission_id: missionId, code_ai_iteration: iteration },
      },
      pending_execution: {
        contract: "AVANTIQO_CODE_AI_PLANNER_EXECUTION_V2",
        organization_id: "org-test",
        provider: "test-provider",
        provider_job_id: "job-other-mission",
        usage_id: deterministicUsageId("mission-other", iteration),
        pricing: {},
        quantity: 1,
        unit: "request",
        metadata: { code_ai_mission_id: "mission-other", code_ai_iteration: iteration },
        started_at: new Date().toISOString(),
      },
      service_runtime: serviceRuntime,
    }),
    /CODE_AI_PLANNER_PENDING_MISSION_MISMATCH/,
  );
});

test("pending planner resume rejects another iteration before settlement", async () => {
  const missionId = "mission-current";
  const iteration = 4;
  const serviceRuntime = {
    async execute() { throw new Error("execute must not run"); },
    async settle() { throw new Error("settle must not run"); },
  };
  await assert.rejects(
    executeCodeAIPlannerRequest({
      execution_input: {
        organization_id: "org-test",
        capability: "ai.code.debug",
        input: { capability: "ai.code.debug", instruction: "continue", quantity: 1 },
        metadata: { code_ai_mission_id: missionId, code_ai_iteration: iteration },
      },
      pending_execution: {
        contract: "AVANTIQO_CODE_AI_PLANNER_EXECUTION_V2",
        organization_id: "org-test",
        provider: "test-provider",
        provider_job_id: "job-wrong-iteration",
        usage_id: deterministicUsageId(missionId, iteration - 1),
        pricing: {},
        quantity: 1,
        unit: "request",
        metadata: { code_ai_mission_id: missionId, code_ai_iteration: iteration - 1 },
        started_at: new Date().toISOString(),
      },
      service_runtime: serviceRuntime,
    }),
    /CODE_AI_PLANNER_PENDING_ITERATION_MISMATCH/,
  );
});


test("planner polling defaults to 250ms for low-latency local completion", async () => {
  const source = await readFile(new URL("../lib/code/runtime/CodeAIPlannerExecutionRuntime.js", import.meta.url), "utf8");
  assert.match(source, /DEFAULT_POLL_INTERVAL_MS = 250/);
  assert.match(source, /Math\.max\(250, Math\.min\(5000/);
});
