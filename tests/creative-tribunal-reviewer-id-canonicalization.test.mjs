import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  "lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js",
  "utf8",
);

test("Tribunal canonicalizes provider reviewer ids before strict identity validation", () => {
  assert.match(source, /function canonicalReviewerId\(value\)/);
  assert.match(source, /expects === "reviewer_id"/);
  assert.match(source, /reviewer_id: canonicalReviewerId\(found\.reviewer_id\)/);
  assert.match(source, /CREATIVE_TRIBUNAL_REVIEWER_ID_MISMATCH/);
});
