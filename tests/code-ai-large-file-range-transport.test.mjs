import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("all Code workspace transports expose private source-bound range mutation", async () => {
  const local = await readFile("lib/code/runtime/CodeWorkspaceLocalRuntime.js", "utf8");
  const sandbox = await readFile("lib/code/runtime/CodeWorkspaceSandboxRuntime.js", "utf8");
  const device = await readFile("lib/code/runtime/CodeWorkspaceDeviceRuntime.js", "utf8");
  const agent = await readFile("scripts/code-device-agent.mjs", "utf8");

  for (const source of [local, sandbox]) {
    assert.match(source, /MAX_RANGE_MUTATION_FILE_BYTES = 1024 \* 1024/);
    assert.match(source, /replaceRange:/);
    assert.match(source, /CODE_AI_REPLACE_RANGE_STALE_SOURCE/);
    assert.match(source, /raw_full_file_persisted: false/);
    assert.doesNotMatch(source, /commit_content/);
  }
  assert.match(device, /replaceRange: \(input\) => call\("workspace\.replace_range"/);
  assert.match(agent, /MAX_RANGE_MUTATION_FILE = 1024 \* 1024/);
  assert.match(agent, /workspace\.replace_range/);
  assert.match(agent, /CODE_AI_REPLACE_RANGE_STALE_SOURCE/);
  assert.match(agent, /raw_full_file_persisted:false/);
  assert.doesNotMatch(agent, /commit_content/);
});

test("normal whole-file caps stay strict while explicit large-file windows remain bounded", async () => {
  const local = await readFile("lib/code/runtime/CodeWorkspaceLocalRuntime.js", "utf8");
  const sandbox = await readFile("lib/code/runtime/CodeWorkspaceSandboxRuntime.js", "utf8");
  const agent = await readFile("scripts/code-device-agent.mjs", "utf8");
  for (const source of [local, sandbox]) {
    assert.match(source, /MAX_FILE_BYTES = 512 \* 1024/);
    assert.match(source, /MAX_RANGE_MUTATION_FILE_BYTES = 1024 \* 1024/);
    assert.match(source, /CODE_AI_FILE_READ_TOO_LARGE/);
    assert.match(source, /CODE_AI_FILE_WRITE_TOO_LARGE/);
    assert.match(source, /CODE_AI_LARGE_FILE_READ_WINDOW_TOO_WIDE/);
    assert.match(source, /contentBytes > 64 \* 1024/);
    assert.match(source, /large_file_window_read/);
  }
  assert.match(agent, /CODE_AI_LARGE_FILE_READ_WINDOW_TOO_WIDE/);
  assert.match(agent, /contentBytes>64\*1024/);
  assert.match(agent, /large_file_window_read/);
});

test("mission runtime persists only bounded range evidence, never reconstructed full content", async () => {
  const mission = await readFile("lib/code/runtime/CodeAIMissionRuntime.js", "utf8");
  assert.match(mission, /recordRangeSourceChange\(state/);
  assert.match(mission, /controller_full_file_reconstruction: true/);
  assert.match(mission, /raw_full_file_persisted: false/);
  assert.doesNotMatch(mission, /commit_content/);
});
