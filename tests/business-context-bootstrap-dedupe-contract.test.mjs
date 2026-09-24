import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/providers/BusinessContextProvider.jsx", import.meta.url), "utf8");

test("workspace bootstrap deduplicates concurrent and immediate remount requests", () => {
  assert.match(source, /const BOOTSTRAP_REUSE_MS = 3000/);
  assert.match(source, /const workspaceBootstrapRequests = new Map\(\)/);
  assert.match(source, /if \(existing\?\.promise\) return existing\.promise/);
  assert.match(source, /if \(existing\?\.value && Number\(existing\.expires_at \|\| 0\) > now\) return existing\.value/);
  assert.match(source, /sharedWorkspaceBootstrapRequest\(\{/);
});
