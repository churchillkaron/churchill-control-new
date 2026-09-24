import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const source = fs.readFileSync(new URL("../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js", import.meta.url), "utf8");
test("sound reviewer uses compact scoped evidence", () => {
  assert.match(source, /function soundVisualSyncPlanEvidence/);
  assert.match(source, /case "SOUND_VISUAL_SYNC":\s*return soundVisualSyncPlanEvidence/);
  assert.doesNotMatch(source, /case "SOUND_VISUAL_SYNC":\s*return \{\s*workflow_kind:[\s\S]{0,180}concept: canonical\.concept/);
});
test("sound reviewer requires concise schema-only output", () => {
  assert.match(source, /Keep the response concise\. Return one JSON object only/);
  assert.match(source, /SOUND_VISUAL_SYNC[\s\S]*reviewer_id: reviewer\.id[\s\S]*score: "0-100"[\s\S]*passed: "boolean"/);
});
