import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runner = await readFile("scripts/run-avantiqo-code-frontier-local.mjs", "utf8");

test("owned frontier benchmark observes local completion at low latency", () => {
  assert.match(runner, /await sleep\(100\)/);
  assert.doesNotMatch(runner, /await sleep\(750\)/);
});
