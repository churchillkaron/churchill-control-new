import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/providers/BusinessContextProvider.jsx", import.meta.url), "utf8");

test("workspace bootstrap deduplicates concurrent Strict Mode loads", () => {
  assert.match(source, /const bootstrapInflight = new Map\(\)/);
  assert.match(source, /const existing = bootstrapInflight\.get\(key\)/);
  assert.match(source, /if \(existing\) return existing/);
  assert.match(source, /bootstrapInflight\.set\(key, request\)/);
  assert.match(source, /bootstrapInflight\.delete\(key\)/);
});

test("workspace bootstrap aborts the underlying fetch instead of leaving zombie retries", () => {
  assert.match(source, /const controller = new AbortController\(\)/);
  assert.match(source, /controller\.abort\("WORKSPACE_BOOTSTRAP_FETCH_TIMEOUT"\)/);
  assert.match(source, /8000/);
  assert.match(source, /signal: controller\.signal/);
  assert.match(source, /fetchBusinessBootstrap\(bootstrapUrl, accessToken\)/);
});
