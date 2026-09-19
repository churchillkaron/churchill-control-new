import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js", import.meta.url), "utf8");

test("tribunal retries one malformed reviewer contract before failing closed", () => {
  assert.match(source, /previous_attempt_rejected: `The previous response did not return the required reviewer contract/);
  assert.match(source, /reviewer_id exactly .*reviewer\.id/);
  assert.match(source, /Do not return a plan or repair envelope/);
  assert.match(source, /if \(text\(output\.reviewer_id\) !== text\(reviewer\.id\)\) \{/);
});
