import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js", import.meta.url), "utf8");

test("tribunal distinguishes creative constructs from external factual claims", () => {
  assert.match(source, /Fictional cinematic world-rules, brand metaphors, creative positioning/);
  assert.match(source, /If the plan contains no explicit externally checkable factual claim, the correct factual verdict is a pass with no factual repair required/);
  assert.match(source, /EXPLICIT_REAL_WORLD_CLAIMS_ONLY_V2/);
  assert.match(source, /CREATIVE_CONSTRUCT_MISCLASSIFIED_AS_EXTERNAL_FACT/);
  assert.match(source, /Do not invent an external-source claim and then fail the plan for lacking that invented source/);
});
