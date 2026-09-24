import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("core Code runtimes are directly importable by plain Node", async () => {
  for (const modulePath of [
    "../lib/code/runtime/CodeAIPlannerExecutionRuntime.js",
    "../lib/code/runtime/CodeAIAutonomousRuntime.js",
    "../lib/code/runtime/CodeAIConversationRuntime.js",
  ]) {
    const loaded = await import(modulePath);
    assert.ok(loaded);
  }
});

test("core autonomous runtime lazy-loads optional web research instead of importing intelligence graph eagerly", async () => {
  const source = await readFile("lib/code/runtime/CodeAIAutonomousRuntime.js", "utf8");
  assert.doesNotMatch(source, /^import .*OperatorWebResearchRuntime/m);
  assert.match(source, /await import\(\s*"\.\.\/\.\.\/platform\/research\/runtime\/OperatorWebResearchRuntime\.js"/);
});

test("planner execution uses portable relative service-runtime import", async () => {
  const source = await readFile("lib/code/runtime/CodeAIPlannerExecutionRuntime.js", "utf8");
  assert.doesNotMatch(source, /@\/lib/);
  assert.match(source, /\.\.\/\.\.\/platform\/service-runtime\/execution\/ServiceExecutionRuntime\.js/);
});
