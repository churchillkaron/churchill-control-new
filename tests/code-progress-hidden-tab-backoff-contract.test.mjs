import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../components/operator/CodeProgressFeedProvider.jsx", import.meta.url), "utf8");

test("hidden Code surfaces back off progress polling", () => {
  assert.match(source, /HIDDEN_POLL_MS = 60000/);
  assert.match(source, /document\.visibilityState === "visible"/);
  assert.match(source, /document\.addEventListener\("visibilitychange", visibilityChanged\)/);
  assert.match(source, /document\.removeEventListener\("visibilitychange", visibilityChanged\)/);
});
