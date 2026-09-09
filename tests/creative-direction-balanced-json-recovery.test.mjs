import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

for (const path of [
  "lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js",
  "lib/creative/director/runtime/CreativeDirectionExactResumeRuntime.js",
]) {
  test(`${path} uses conservative balanced JSON recovery`, () => {
    const source = fs.readFileSync(path, "utf8");
    assert.ok(source.includes("function firstBalancedJsonObject"));
    assert.ok(source.includes("const suffix = source.slice(index + 1).trim();"));
    assert.ok(source.includes("if (balanced)"));
  });
}
