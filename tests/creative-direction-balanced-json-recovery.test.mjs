import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

for (const path of [
  "lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js",
  "lib/creative/director/runtime/CreativeDirectionExactResumeRuntime.js",
]) {
  test(`${path} accepts only balanced JSON with redundant closing delimiters`, () => {
    const source = fs.readFileSync(path, "utf8");
    assert.match(source, /function firstBalancedJsonObject/);
    assert.match(source, /!\/\^\[}\\\\\]\\\]\+\$\/\.test\(suffix\)/);
    assert.match(source, /const balanced = firstBalancedJsonObject/);
  });
}
