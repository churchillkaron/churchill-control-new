import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js", import.meta.url),
  "utf8",
);

test("Tribunal preserves successful sibling reviews when one reviewer fails", () => {
  assert.match(source, /Promise\.allSettled\(/);
  assert.match(source, /entry\.status === "fulfilled"/);
  assert.match(source, /const results = settledResults[\s\S]*entry\.status === "fulfilled"/);
  assert.match(source, /error\.settled_reviews = results/);
  assert.match(source, /error\.partial_reviews = results/);
});
