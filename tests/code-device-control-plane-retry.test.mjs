import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/code/runtime/CodeWorkspaceDeviceRuntime.js", import.meta.url), "utf8");

test("device control-plane reads use bounded retry policy", () => {
  assert.match(source, /const CONTROL_PLANE_QUERY_TIMEOUTS_MS = Object\.freeze\(\[5000, 10000, 15000\]\)/);
  assert.match(source, /const CONTROL_PLANE_MAX_ATTEMPTS = CONTROL_PLANE_QUERY_TIMEOUTS_MS\.length/);
  assert.match(source, /function controlPlaneRetryable/);
  assert.match(source, /async function controlPlaneRead/);
  assert.match(source, /deviceForOrganization[\s\S]*controlPlaneRead\(\(attempt\) => supabaseAdmin/);
  assert.match(source, /while \(Date\.now\(\) < deadline\)[\s\S]*controlPlaneRead\(\(attempt\) => supabaseAdmin/);
});

test("retry policy recognizes timeout and connection-reset style failures", () => {
  assert.match(source, /TimeoutError/);
  assert.match(source, /message\.includes\("timeout"\)/);
  assert.match(source, /message\.includes\("aborted"\)/);
  assert.match(source, /message\.includes\("fetch failed"\)/);
  assert.match(source, /message\.includes\("econnreset"\)/);
});
