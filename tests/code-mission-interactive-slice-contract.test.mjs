import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";


const ide = await readFile(
  new URL("../components/creative/code/AvantiqoCodeIDE.jsx", import.meta.url),
  "utf8",
);

const route = await readFile(
  new URL("../app/api/operator/code/mission/route.js", import.meta.url),
  "utf8",
);

test("Code Studio mission requests use a bounded interactive slice", () => {
  assert.match(route, /timeout_ms: 30000/);
  assert.doesNotMatch(route, /timeout_ms: 840000/);
});


test("Code Studio resume continuation latency stays sub-second", () => {
  assert.match(ide, /MISSION_RESUME_SETTLE_MS = 250/);
  assert.match(ide, /await wait\(MISSION_RESUME_SETTLE_MS\)/);
  assert.doesNotMatch(ide, /await wait\(1200\);\n\s*continue;/);
});
