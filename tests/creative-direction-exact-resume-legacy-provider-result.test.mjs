import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const source = fs.readFileSync("lib/creative/director/runtime/CreativeDirectionExactResumeRuntime.js", "utf8");
test("Studio exact resume accepts legacy provider_result payloads", () => {
  assert.match(source, /usage\.metadata\?\.result \|\| usage\.metadata\?\.provider_result/);
});
