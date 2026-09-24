import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const core = await readFile(new URL("../lib/code/runtime/CodeAIWorkPackageCoreRuntime.js", import.meta.url), "utf8");
const live = await readFile(new URL("../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", import.meta.url), "utf8");

test("missing read recovery evidence survives planner-state compaction", () => {
  assert.match(core, /requested_path: text\(item\.result\?\.requested_path/);
  assert.match(core, /candidate_paths: list\(item\.result\?\.candidate_paths\)/);
  assert.match(core, /candidate_count: Number\(item\.result\?\.candidate_count/);
});

test("replan prompt forbids invented replacement paths and requires repository discovery", () => {
  assert.match(live, /MISSING REPOSITORY PATH RECOVERY REQUIRED/);
  assert.match(live, /Do not invent another replacement path/);
  assert.match(live, /Do not synthesize a plausible src\/\.\.\. filename/);
  assert.match(live, /first operation must be search against the real repository/);
  assert.match(live, /missingPathRecoveryGuidance,/);
});
