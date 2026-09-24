import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const autonomy = await readFile(new URL("../lib/code/runtime/CodeAIAutonomousRuntime.js", import.meta.url), "utf8");
const ide = await readFile(new URL("../components/creative/code/AvantiqoCodeIDE.jsx", import.meta.url), "utf8");
const deviceRuntime = await readFile(new URL("../lib/code/runtime/CodeWorkspaceDeviceRuntime.js", import.meta.url), "utf8");

test("Code retries transient upstream and workspace failures instead of terminating immediately", () => {
  assert.match(autonomy, /TRANSIENT_WORKSPACE_RETRY_LIMIT = 3/);
  assert.match(autonomy, /500\|502\|503\|504\|520\|521\|522\|523\|524/);
  assert.match(autonomy, /web server is down/);
  assert.match(autonomy, /econnreset\|econnrefused\|etimedout\|fetch failed/);
  assert.match(autonomy, /await transientRetryDelay\(transientWorkspaceRetries\)/);
});

test("Talk sanitizes transient infrastructure failures", () => {
  assert.match(ide, /A temporary backend connection failed while Code was working/);
  assert.match(ide, /<!doctype html\|<html\|web server is down/);
});

test("Talk renders one evolving live line instead of a historical event stack", () => {
  assert.doesNotMatch(ide, /talkActivityNarration\.slice\(-6, -1\)\.map/);
  assert.match(ide, /<span>\{liveNarrationContent\}<\/span>/);
});


test("device control-plane calls cannot hang past the local pass boundary", () => {
  assert.match(deviceRuntime, /CONTROL_PLANE_QUERY_TIMEOUT_MS = 5000/);
  assert.match(deviceRuntime, /AbortSignal\.timeout\(CONTROL_PLANE_QUERY_TIMEOUT_MS\)/);
  assert.match(deviceRuntime, /\.maybeSingle\(\)\n\s*\.abortSignal\(controlPlaneSignal\(\)\)/);
  assert.match(deviceRuntime, /\.single\(\)\n\s*\.abortSignal\(controlPlaneSignal\(\)\)/);
});

test("Talk feed and user bubbles stay inside the workspace", () => {
  assert.match(ide, /overflow-x-hidden overflow-y-auto/);
  assert.match(ide, /max-w-\[min\(68%,760px\)\]/);
  assert.match(ide, /overflow-hidden break-words rounded-2xl/);
});
