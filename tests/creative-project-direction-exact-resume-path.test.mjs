import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const source = fs.readFileSync("lib/creative/director/runtime/CreativeProjectDirectionRuntime.js", "utf8");
test("canonical Studio project direction always installs exact resume", () => {
  assert.match(source, /CreativeDirectionCostApprovalRuntime/);
  assert.match(source, /CreativeDirectionExactResumeRuntime/);
});
