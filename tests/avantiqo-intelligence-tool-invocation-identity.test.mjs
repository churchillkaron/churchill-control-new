import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js", "utf8");

test("reasoning transcript retains only bounded tool invocation identity", () => {
  assert.match(source, /invocation_identity/);
  assert.match(source, /capability_key: text\(args\.capability_key\)/);
  assert.doesNotMatch(source, /invocation_identity:[\s\S]{0,200}payload:/);
});
