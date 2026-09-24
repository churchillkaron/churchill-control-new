import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../lib/platform/security/requireOrganizationAccess.js", import.meta.url),
  "utf8",
);

test("Code organization access has hard network deadlines", () => {
  assert.match(source, /ACCESS_NETWORK_TIMEOUT_MS = 5000/);
  assert.match(source, /AbortSignal\.timeout\(ACCESS_NETWORK_TIMEOUT_MS\)/);
  assert.match(source, /function boundedAccessFetch/);
  assert.match(source, /fetch: boundedAccessFetch/);
  assert.match(source, /\.abortSignal\(accessTimeoutSignal\(\)\)/);
});

test("bearer auth uses bounded fetch instead of unbounded auth sdk request", () => {
  assert.match(source, /boundedAccessFetch\(/);
  assert.match(source, /\/auth\/v1\/user/);
  assert.doesNotMatch(source, /supabaseAdmin\.auth\.getUser\(token\)/);
});
