import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../lib/platform/security/requireOrganizationAccess.js", import.meta.url), "utf8");

test("localhost Code APIs use a longer credential-fingerprint access cache", () => {
  assert.match(source, /LOCAL_CODE_ACCESS_HOT_CACHE_TTL_MS = 60 \* 1000/);
  assert.match(source, /function localCodeAccessRequest\(request\)/);
  assert.match(source, /\["localhost", "127\.0\.0\.1", "::1"\]\.includes\(url\.hostname\)/);
  assert.match(source, /url\.pathname\.startsWith\("\/api\/operator\/code\/"\)/);
  assert.match(source, /const hotCacheTtlMs = localCodeAccessRequest\(request\)/);
  assert.match(source, /loadAccessHotCache\(hotCacheKey, hotCacheTtlMs\)/);
});

test("normal platform access keeps the shorter authorization cache", () => {
  assert.match(source, /ACCESS_HOT_CACHE_TTL_MS = 10 \* 1000/);
  assert.match(source, /: ACCESS_HOT_CACHE_TTL_MS;/);
});
