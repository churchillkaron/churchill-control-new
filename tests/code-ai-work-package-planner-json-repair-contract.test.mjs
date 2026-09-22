import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", import.meta.url), "utf8");

test("invalid planner JSON becomes bounded compact repair instead of terminal block", () => {
  assert.match(source, /PLANNER OUTPUT REPAIR:/);
  assert.match(source, /reason === "CODE_AI_WORK_PACKAGE_JSON_INVALID"/);
  assert.match(source, /planner_output_repair_required:/);
  assert.match(source, /compact_json_only: true/);
  assert.match(source, /status: "repair_required"/);
  assert.match(source, /PLANNER_OUTPUT_REPAIR_REQUIRED/);
  assert.match(source, /raw_reasoning_persisted: false/);
});
