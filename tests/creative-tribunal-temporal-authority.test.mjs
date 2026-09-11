import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const source = await readFile(new URL("../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js", import.meta.url), "utf8");
test("tribunal reviewers receive explicit temporal authority without invalidating settled evidence hashes", () => {
  assert.match(source, /contract: "CREATIVE_REVIEW_TEMPORAL_AUTHORITY_V1"/);
  assert.match(source, /current_timestamp_utc: now\.toISOString\(\)/);
  assert.match(source, /temporal_authority: reviewTemporalAuthority\(\)/);
  const hashBody = source.slice(source.indexOf("function reviewerEvidenceHash"), source.indexOf("function reviewPayload"));
  assert.doesNotMatch(hashBody, /temporal_authority/);
});
