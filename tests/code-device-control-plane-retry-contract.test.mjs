import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/code/runtime/CodeWorkspaceDeviceRuntime.js", import.meta.url), "utf8");
const agentSource = await readFile(new URL("../scripts/code-device-agent.mjs", import.meta.url), "utf8");

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


test("device agent keeps a bounded fast-poll burst during active Code interaction", () => {
  assert.match(agentSource, /DEVICE_INTERACTIVE_BURST_MS=.*30000/);
  assert.match(agentSource, /if\(handled>0\)interactiveUntil=Date\.now\(\)\+DEVICE_INTERACTIVE_BURST_MS/);
  assert.match(agentSource, /Date\.now\(\)<interactiveUntil/);
  assert.match(agentSource, /interactive\?DEVICE_ACTIVE_POLL_INTERVAL_MS:DEVICE_IDLE_POLL_INTERVAL_MS/);
  assert.match(agentSource, /DEVICE_IDLE_POLL_INTERVAL_MS=.*1000/);
});


test("device agent enforces one local process per device identity", () => {
  assert.match(agentSource, /AGENT_LOCK = path\.join\(HOME, "code-device-agent\.lock"\)/);
  assert.match(agentSource, /open\(AGENT_LOCK,"wx"\)/);
  assert.match(agentSource, /process\.kill\(pid,0\)/);
  assert.match(agentSource, /CODE_DEVICE_AGENT_ALREADY_RUNNING/);
  assert.match(agentSource, /await acquireAgentSingleton\(\);await loop\(\)/);
});
