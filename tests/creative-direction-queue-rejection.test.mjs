import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const source = await readFile(new URL("../lib/creative/director/runtime/CreativeDirectionCostApprovalRuntime.js", import.meta.url), "utf8");
test("direction queue tail swallows caller rejection after preserving serialization", () => {
  assert.match(source, /const current = prior\.catch\(\(\) => null\)\.then\(execute\);/);
  assert.match(source, /const tail = current\.catch\(\(\) => null\)\.finally\(\(\) => \{/);
  assert.match(source, /return current;/);
});
