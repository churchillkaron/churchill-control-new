import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js", import.meta.url), "utf8");

test("tribunal retries one malformed reviewer contract before failing closed", () => {
  assert.match(source, /for \(let schemaAttempt = 1; schemaAttempt <= 2; schemaAttempt \+= 1\)/);
  assert.match(source, /compactReviewSchemaRetryPayload/);
  assert.match(source, /creative_review_schema_attempt: schemaAttempt/);
  assert.match(source, /if \(schemaAttempt === 1\) continue/);
  assert.match(source, /CREATIVE_TRIBUNAL_REVIEW_SCHEMA_INVALID/);
});
