import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile(
  new URL("../app/api/operator/code/mission/route.js", import.meta.url),
  "utf8",
);

test("Code Studio mission requests use a bounded interactive slice", () => {
  assert.match(route, /timeout_ms: 30000/);
  assert.doesNotMatch(route, /timeout_ms: 840000/);
});
