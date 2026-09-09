import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync("lib/creative/director/runtime/CreativeDirectionExactResumeRuntime.js", "utf8");

test("Studio exact resume keys checkpoints by the actual direction request", () => {
  assert.match(source, /const requestHash = hash\(\{/);
  assert.match(source, /request_hash: requestHash/);
  assert.match(source, /creative_direction_resume_request_hash: identity\.request_hash/);
  assert.match(source, /CREATIVE_DIRECTION_EXACT_RESUME_STALE_ENTRY/);
});
