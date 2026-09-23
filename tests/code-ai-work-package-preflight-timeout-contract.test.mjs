import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/code/runtime/CodeAIWorkPackageRuntime.js", import.meta.url), "utf8");

test("optional engineering preflights are hard-bounded before repository work", () => {
  assert.match(source, /function boundedOptionalPreflight\(operation, label, timeoutMs = 5000\)/);
  assert.match(source, /"verified_engineering_memory"/);
  assert.match(source, /"engineering_skills"/);
  assert.match(source, /"engineering_skill_governance"/);
  assert.match(source, /"engineering_hotspot_history"/);
  assert.match(source, /CODE_AI_OPTIONAL_PREFLIGHT_TIMEOUT/);
});
