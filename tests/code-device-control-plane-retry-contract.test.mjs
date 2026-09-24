import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/code/runtime/CodeWorkspaceDeviceRuntime.js", import.meta.url), "utf8");

test("device control-plane reads use progressive bounded deadlines", () => {
  assert.match(source, /CONTROL_PLANE_QUERY_TIMEOUTS_MS = Object\.freeze\(\[5000, 10000, 15000\]\)/);
  assert.match(source, /const CONTROL_PLANE_MAX_ATTEMPTS = CONTROL_PLANE_QUERY_TIMEOUTS_MS\.length/);
  assert.match(source, /const result = await factory\(attempt\)/);
  assert.match(source, /abortSignal\(controlPlaneSignal\(attempt\)\)/);
});

test("transient control-plane failures remain bounded and retryable", () => {
  assert.match(source, /CONTROL_PLANE_RETRY_DELAYS_MS = Object\.freeze\(\[150, 450, 1000\]\)/);
  assert.match(source, /if \(!controlPlaneRetryable\(error\) \|\| attempt >= CONTROL_PLANE_MAX_ATTEMPTS - 1\) throw error/);
});

test("device control-plane retry classifier includes undici timeouts and Cloudflare 5xx SSL failures", () => {
  assert.match(source, /error\?\.name === "TimeoutError"/);
  assert.match(source, /status >= 500 && status <= 599/);
  assert.match(source, /ssl handshake/);
  assert.match(source, /ssl_handshake_failed/);
});

test("device job enqueue is idempotent when insert acknowledgement is lost", () => {
  assert.match(source, /const jobId = crypto\.randomUUID\(\)/);
  assert.match(source, /upsert\(row, \{ onConflict: "id", ignoreDuplicates: true \}\)/);
  assert.match(source, /id: jobId/);
  assert.match(source, /existing\.data\?\.id === jobId/);
  assert.match(source, /CODE_AI_DEVICE_JOB_IDEMPOTENCY_BINDING_MISMATCH/);
  assert.match(source, /\.eq\("id", jobId\)/);
  assert.doesNotMatch(source, /\.insert\(\{[\s\S]{0,500}avantiqo_code_device_jobs/);
});
