import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const mission = await readFile(new URL("../lib/code/runtime/CodeAIMissionRuntime.js", import.meta.url), "utf8");

test("generic one-token invented paths cannot auto-bind to unrelated tracked files", () => {
  assert.match(mission, /if \(requestedTokens\.length < 2\) return false/);
  assert.match(mission, /if \(requestedBase === candidateBase\) return true/);
  assert.match(mission, /if \(requestedStem && requestedStem === candidateStem\) return true/);
});
