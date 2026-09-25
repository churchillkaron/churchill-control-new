import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", import.meta.url), "utf8");

test("local Code planner yields bounded continuation slices instead of holding 25 second default windows", () => {
  assert.match(source, /poll_window_ms: interactivePreview\?\.authorized === true[\s\S]*\? 8000[\s\S]*local_compute_required === true[\s\S]*\? 10000/);
  assert.match(source, /poll_interval_ms: interactivePreview\?\.authorized === true[\s\S]*\? 250[\s\S]*local_compute_required === true[\s\S]*\? 250/);
});
