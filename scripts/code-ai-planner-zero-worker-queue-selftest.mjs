import assert from "node:assert/strict";

process.env.NODE_ENV = "development";
process.env.RUNPOD_API_KEY = "selftest-runpod-key";
process.env.RUNPOD_MANAGEMENT_API_KEY = "selftest-management-key";
process.env.RUNPOD_AVANTIQO_CODE_ENDPOINT_ID = "code-endpoint";

const {
  executeCodeAIPlannerRequest,
  CodeAIPlannerExecutionRuntime,
} = await import("../lib/code/runtime/CodeAIPlannerExecutionRuntime.js");

assert.equal(CodeAIPlannerExecutionRuntime.zero_worker_queue_stall_ms, 30_000);

const originalFetch = globalThis.fetch;

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function executionInput() {
  return {
    organization_id: "selftest-org",
    provider_id: "avantiqo-code",
    capability: "ai.code.debug",
    input: {
      capability: "ai.code.debug",
      instructions: "bounded self-test only",
    },
    metadata: {
      execution_scope: "BENCHMARK_REVIEW_PREVIEW",
      provider_endpoint_id: "code-endpoint",
    },
  };
}

function pendingExecution({ jobId, recoveryCount = 0, ageMs = 60_000 } = {}) {
  return {
    contract: "AVANTIQO_CODE_AI_PLANNER_EXECUTION_V2",
    organization_id: "selftest-org",
    provider: "avantiqo-code",
    provider_job_id: jobId,
    provider_endpoint_id: "code-endpoint",
    usage_id: `usage-${jobId}`,
    pricing: {},
    quantity: 1,
    unit: "request",
    metadata: {
      execution_scope: "BENCHMARK_REVIEW_PREVIEW",
      provider_endpoint_id: "code-endpoint",
      code_endpoint_preflight: {
        transport: "RUNPOD_SERVERLESS",
      },
    },
    credential_id: null,
    started_at: new Date(Date.now() - ageMs).toISOString(),
    model: "avantiqo-code-v1",
    stale_queue_recovery_count: recoveryCount,
    recovered_from_provider_job_id: null,
  };
}

async function expectFailure(fn, marker) {
  let caught = null;
  try {
    await fn();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `${marker}: expected failure`);
  assert.match(String(caught.message || caught), new RegExp(marker));
}

async function zeroWorkerQueueScenario() {
  let canceled = false;
  let cancelCalls = 0;
  let executeCalls = 0;
  let settleCalls = 0;

  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = String(init.method || "GET").toUpperCase();
    if (url.endsWith("/health") && method === "GET") {
      return jsonResponse({
        jobs: { inQueue: 1, inProgress: 0 },
        workers: {
          idle: 0,
          initializing: 0,
          ready: 0,
          running: 0,
          throttled: 0,
          unhealthy: 0,
        },
      });
    }
    if (url.endsWith("/cancel/zero-worker-job") && method === "POST") {
      canceled = true;
      cancelCalls += 1;
      return jsonResponse({ id: "zero-worker-job", status: "CANCELLED" });
    }
    throw new Error(`UNEXPECTED_FETCH:${method}:${url}`);
  };

  const serviceRuntime = {
    async execute() {
      executeCalls += 1;
      throw new Error("ZERO_WORKER_SCENARIO_MUST_NOT_SUBMIT_REPLACEMENT");
    },
    async settle() {
      settleCalls += 1;
      if (canceled) {
        return { success: false, failed: true, pending: false, provider_status: "cancelled" };
      }
      return { success: true, failed: false, pending: true, provider_status: "queued" };
    },
  };

  await expectFailure(
    () => executeCodeAIPlannerRequest({
      execution_input: executionInput(),
      pending_execution: pendingExecution({ jobId: "zero-worker-job", ageMs: 60_000 }),
      poll_interval_ms: 250,
      poll_window_ms: 1000,
      service_runtime: serviceRuntime,
    }),
    "CODE_AI_PLANNER_ZERO_WORKER_QUEUE_STALL",
  );

  assert.equal(cancelCalls, 1);
  assert.equal(executeCalls, 0);
  assert.ok(settleCalls >= 2);
  return { cancelCalls, executeCalls, settleCalls };
}

async function exhaustedRecoveryScenario() {
  let canceled = false;
  let cancelCalls = 0;
  let executeCalls = 0;
  let settleCalls = 0;

  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const method = String(init.method || "GET").toUpperCase();
    if (url.endsWith("/health") && method === "GET") {
      return jsonResponse({
        jobs: { inQueue: 1, inProgress: 0 },
        workers: {
          idle: 0,
          initializing: 0,
          ready: 1,
          running: 0,
          throttled: 0,
          unhealthy: 0,
        },
      });
    }
    if (url.endsWith("/cancel/exhausted-job") && method === "POST") {
      canceled = true;
      cancelCalls += 1;
      return jsonResponse({ id: "exhausted-job", status: "CANCELLED" });
    }
    throw new Error(`UNEXPECTED_FETCH:${method}:${url}`);
  };

  const serviceRuntime = {
    async execute() {
      executeCalls += 1;
      throw new Error("EXHAUSTED_SCENARIO_MUST_NOT_SUBMIT_REPLACEMENT");
    },
    async settle() {
      settleCalls += 1;
      if (canceled) {
        return { success: false, failed: true, pending: false, provider_status: "cancelled" };
      }
      return { success: true, failed: false, pending: true, provider_status: "queued" };
    },
  };

  await expectFailure(
    () => executeCodeAIPlannerRequest({
      execution_input: executionInput(),
      pending_execution: pendingExecution({
        jobId: "exhausted-job",
        recoveryCount: 1,
        ageMs: 9 * 60_000,
      }),
      poll_interval_ms: 250,
      poll_window_ms: 1000,
      service_runtime: serviceRuntime,
    }),
    "CODE_AI_PLANNER_STALE_QUEUE_RECOVERY_EXHAUSTED",
  );

  assert.equal(cancelCalls, 1);
  assert.equal(executeCalls, 0);
  assert.ok(settleCalls >= 2);
  return { cancelCalls, executeCalls, settleCalls };
}

try {
  const zeroWorker = await zeroWorkerQueueScenario();
  const exhausted = await exhaustedRecoveryScenario();
  console.log(JSON.stringify({
    success: true,
    contract: "AVANTIQO_CODE_AI_PLANNER_ZERO_WORKER_QUEUE_SELFTEST_V1",
    zero_worker_stall_threshold_ms: CodeAIPlannerExecutionRuntime.zero_worker_queue_stall_ms,
    zero_worker_exact_cancel_verified: zeroWorker.cancelCalls === 1,
    zero_worker_replacement_forbidden: zeroWorker.executeCalls === 0,
    exhausted_exact_cancel_verified: exhausted.cancelCalls === 1,
    exhausted_replacement_forbidden: exhausted.executeCalls === 0,
    orphan_queue_path_closed: true,
    model_call_performed: false,
    provider_inference_performed: false,
    wallet_mutation_performed: false,
    production_deploy_performed: false,
    secrets_printed: false,
  }, null, 2));
} finally {
  globalThis.fetch = originalFetch;
}
