import test from "node:test";
import assert from "node:assert/strict";
import { executeCodeAIPlannerRequest } from "../lib/code/runtime/CodeAIPlannerExecutionRuntime.js";

test("transient 521 while settling a pending planner job retries the same job without re-execution", async () => {
  let executeCalls = 0;
  let settleCalls = 0;
  const providerJobId = "external-provider-job-123";
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
      usage_id: "usage-test",
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
