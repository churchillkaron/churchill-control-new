import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/code/runtime/CodeAIWorkPackageDeterministicConvergenceRuntime.js", import.meta.url), "utf8");

test("pending provider execution takes precedence over deterministic discovery convergence", () => {
  assert.match(
    source,
    /state\.base_commit\s*&&\s*!state\.planner_pending\s*&&\s*!hasImplementation\s*&&\s*discoveryStagnation\.repeated/s,
  );
});

test("deterministic completion still requires planner pending to be absent", () => {
  assert.match(source, /hasImplementation\s*&&\s*!state\.planner_pending\s*&&\s*verifier/s);
});
