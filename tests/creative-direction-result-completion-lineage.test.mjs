import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const source = fs.readFileSync(
  "lib/creative/director/runtime/CreativeDirectionResultCompletionRuntime.js",
  "utf8",
);

test("direction result recovery is isolated by creative lineage", () => {
  assert.match(source, /CreativeProjectRuntime/);
  assert.match(source, /function requestIdentity\(input = \{\}, lineageId = ""\)/);
  assert.match(source, /creative_direction_lineage_id: text\(lineageId\) \|\| null/);
  assert.match(source, /project\?\.metadata\?\.creative_direction_lineage_id/);
  assert.match(source, /creative_direction_lineage_id:\s*lineageId \|\| null/);
});
