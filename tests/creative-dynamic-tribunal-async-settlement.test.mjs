import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js", import.meta.url),
  "utf8",
);

test("dynamic tribunal unwraps async provider settlement before parsing creative output", () => {
  assert.match(source, /const raw = object\(transport\)\.raw/);
  assert.match(source, /transport = raw/);
  assert.match(source, /transport\?\.output\?\.text/);
});
