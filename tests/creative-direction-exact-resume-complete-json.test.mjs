import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const source = fs.readFileSync("lib/creative/director/runtime/CreativeDirectionExactResumeRuntime.js", "utf8");
test("Studio exact resume rejects structurally incomplete persisted direction JSON", () => {
  assert.match(source, /function recoverableDirectionPayload/);
  assert.match(source, /JSON\.parse\(value\)/);
  assert.match(source, /CREATIVE_DIRECTION_EXACT_RESUME_UNRECOVERABLE/);
  assert.match(source, /return null;/);
});
