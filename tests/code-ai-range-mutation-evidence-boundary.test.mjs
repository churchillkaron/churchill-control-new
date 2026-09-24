import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const mission = await readFile("lib/code/runtime/CodeAIMissionRuntime.js", "utf8");
const local = await readFile("lib/code/runtime/CodeWorkspaceLocalRuntime.js", "utf8");
const sandbox = await readFile("lib/code/runtime/CodeWorkspaceSandboxRuntime.js", "utf8");
const device = await readFile("scripts/code-device-agent.mjs", "utf8");

test("range mutation full content stays inside the transport/controller boundary and never enters evidence", () => {
  assert.doesNotMatch(local, /commit_content/);
  assert.doesNotMatch(sandbox, /commit_content/);
  assert.doesNotMatch(device, /commit_content/);
  assert.match(local, /raw_full_file_persisted: false/);
  assert.match(sandbox, /raw_full_file_persisted: false/);
  assert.match(device, /raw_full_file_persisted\s*(?::|=)\s*false/);
  assert.match(mission, /controller_full_file_reconstruction: true/);
  assert.match(mission, /raw_full_file_persisted: false/);
  assert.doesNotMatch(mission, /addEvidence\([\s\S]{0,500}commit_content/);
});

test("large range mutation remains aligned with the existing 1MB source-change/commit ceiling", () => {
  assert.match(local, /MAX_RANGE_MUTATION_FILE_BYTES = 1024 \* 1024/);
  assert.match(sandbox, /MAX_RANGE_MUTATION_FILE_BYTES = 1024 \* 1024/);
  assert.match(device, /MAX_RANGE_MUTATION_FILE = 1024 \* 1024/);
});
