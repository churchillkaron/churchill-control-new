import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../lib/creative/post-production/runtime/AvantiqoInvestorStudioExecutionRuntime.js", import.meta.url),
  "utf8",
);

test("direction approval explicitly authorizes and budgets the dynamic tribunal", () => {
  assert.match(source, /"CREATIVE_DYNAMIC_TRIBUNAL_\*"/);
  assert.match(source, /const MAXIMUM_DYNAMIC_TRIBUNAL_CALLS = 22/);
  assert.match(
    source,
    /12 \+ MAXIMUM_DYNAMIC_TRIBUNAL_CALLS \+ maximumTemporalSceneCalls\(job\.duration_seconds\)/,
  );
});
