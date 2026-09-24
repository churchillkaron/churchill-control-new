import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js", import.meta.url), "utf8");

test("tribunal rejects echoed or no-op repair output before paid re-review", () => {
  assert.match(source, /const repairPatch = normalizedRepairPatch\(repair\.output, plan\)/);
  assert.match(source, /hash\(canonicalReviewPlan\(candidate\)\) === hash\(canonicalReviewPlan\(plan\)\)/);
  assert.match(source, /CREATIVE_TRIBUNAL_REPAIR_NOOP_OR_ECHO/);
});

test("repair prompt does not duplicate the entire tribunal payload", () => {
  const start = source.indexOf("function repairPayload");
  const end = source.indexOf("async function runReviews", start);
  const repairPayload = source.slice(start, end);
  assert.doesNotMatch(repairPayload, /\n\s*tribunal,\n\s*plan,/);
  assert.match(repairPayload, /context: compactRepairContext\(context\)/);
  assert.match(repairPayload, /plan: compactRepairPlan\(plan\)/);
  assert.doesNotMatch(repairPayload, /plan: canonicalReviewPlan\(plan\)/);
});
