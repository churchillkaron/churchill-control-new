import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const route = await readFile(new URL("../app/api/operator/code/mission/route.js", import.meta.url), "utf8");

test("Code mission service-gate database calls are hard bounded", () => {
  assert.match(route, /CODE_STUDIO_GATE_DB_TIMEOUT_MS = 5000/);
  assert.match(route, /AbortSignal\.timeout\(CODE_STUDIO_GATE_DB_TIMEOUT_MS\)/);
  const matches = route.match(/\.abortSignal\(gateDbSignal\(\)\)/g) || [];
  assert.ok(matches.length >= 3, "read, enable, and restore service-gate queries must be bounded");
});
