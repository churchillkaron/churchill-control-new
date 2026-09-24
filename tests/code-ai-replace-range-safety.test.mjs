import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const mission = await readFile("lib/code/runtime/CodeAIMissionRuntime.js", "utf8");
const live = await readFile("lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", "utf8");
const core = await readFile("lib/code/runtime/CodeAIWorkPackageCoreRuntime.js", "utf8");

test("replace_range is a governed first-class mutation action", () => {
  assert.match(mission, /"replace_range"/);
  assert.match(core, /"replace_range"/);
  assert.match(live, /"replace_range"/);
});

test("replace_range is source-bound and controller reconstructs the full file", () => {
  assert.match(mission, /CODE_AI_REPLACE_RANGE_STALE_SOURCE/);
  assert.match(mission, /expected_sha256/);
  assert.match(mission, /controller_full_file_reconstruction: true/);
  assert.match(mission, /workspace\.read\(\{[\s\S]*end_line: 1000000/);
});

test("complete-file replacement is blocked when only partial source evidence exists", () => {
  assert.match(live, /partialObservedSourcePaths/);
  assert.match(live, /CODE_AI_WORK_PACKAGE_PARTIAL_SOURCE_COMPLETE_REPLACEMENT_FORBIDDEN/);
  assert.match(live, /partial_source_replacement/);
  assert.match(live, /Use replace_range instead/);
});

test("planner policy allows range mutation wherever complete-file mutation is allowed", () => {
  assert.match(core, /\["apply_files", "replace_range"\]/);
  assert.match(core, /IMPLEMENTATION_ACTIONS[\s\S]*"replace_range"/);
});

test("native range transports never return reconstructed full file content", async () => {
  const local = await readFile("lib/code/runtime/CodeWorkspaceLocalRuntime.js", "utf8");
  const sandbox = await readFile("lib/code/runtime/CodeWorkspaceSandboxRuntime.js", "utf8");
  const device = await readFile("scripts/code-device-agent.mjs", "utf8");
  for (const [name, source] of [["local", local], ["sandbox", sandbox], ["device", device]]) {
    assert.doesNotMatch(source, /commit_content/, name);
    assert.match(source, /raw_full_file_persisted\s*(?::|=)\s*false/, name);
  }
});
