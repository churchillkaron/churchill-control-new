import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/code/runtime/CodeAIWorkPackageDeterministicConvergenceRuntime.js", import.meta.url), "utf8");

test("repeated equivalent discovery is detected before another planner call", () => {
  assert.match(source, /function discoveryStagnationSnapshot/);
  assert.match(source, /searches\.length >= 2 && equivalentSearchCount >= 2 && reads\.length === 0/);
  assert.match(source, /const discoveryStagnation = discoveryStagnationSnapshot\(state\)/);
  assert.match(source, /discoveryStagnation\.repeated/);
});

test("stagnation convergence consumes a real stored search match without reasoning", () => {
  assert.match(source, /preferredDiscoveryPath\(snapshot\.candidate_paths\)/);
  assert.match(source, /action: "read"/);
  assert.match(source, /file_path: targetPath/);
  assert.match(source, /reasoning_call_consumed: false/);
  assert.match(source, /mode: "DISCOVERY_SEARCH_TO_REAL_READ"/);
});

test("empty repeated literal discovery is converted to deterministic keyword search before failing closed", () => {
  assert.match(source, /function deterministicDiscoveryRegex/);
  assert.match(source, /DETERMINISTIC_DISCOVERY_KEYWORD_RECOVERY/);
  assert.match(source, /action: "search"/);
  assert.match(source, /mode: "regex"/);
  assert.match(source, /preferredDiscoveryPath\(recoveredSnapshot\.candidate_paths\)/);
  assert.match(source, /CODE_AI_DISCOVERY_STAGNATION_NO_REAL_TARGET/);
});
