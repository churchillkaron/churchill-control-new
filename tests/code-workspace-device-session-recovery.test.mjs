import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/code/runtime/CodeWorkspaceRuntime.js", import.meta.url), "utf8");

test("missing device session can reopen the same repository instead of crashing", () => {
  assert.match(source, /function recoverableMissingDeviceSession/);
  assert.match(source, /message\.includes\("ENOENT"\)/);
  assert.match(source, /if \(!recoverableMissingDeviceSession\(error\) \|\| !text\(input\.repository_url\)\) throw error/);
  assert.match(source, /workspace = await runtime\.open\(\{[\s\S]*\.\.\.input,[\s\S]*session_id: null/);
});

test("device session recovery does not swallow unrelated attach failures", () => {
  assert.match(source, /if \(!recoverableMissingDeviceSession\(error\).*\) throw error/);
  assert.doesNotMatch(source, /CODE_AI_DEVICE_OFFLINE/);
  assert.doesNotMatch(source, /CODE_AI_DEVICE_NOT_AVAILABLE/);
});
