import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", import.meta.url), "utf8");

test("planner is instructed to preserve observed structured input shape", () => {
  assert.match(source, /OBSERVED SOURCE SHAPE IS A CONTRACT SIGNAL/);
  assert.match(source, /implement coercion\/validation at that observed field/);
  assert.match(source, /do not silently reinterpret the whole object as the primitive value/);
});

test("planner cannot claim unobserved repository evidence", () => {
  assert.match(source, /EVIDENCE CLAIMS MUST BE OBSERVED/);
  assert.match(source, /Do not cite a test file, helper, caller, repository pattern, or nearby implementation/);
});
