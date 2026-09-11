import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../lib/creative/director/runtime/CreativeConceptCouncilRuntime.js", import.meta.url),
  "utf8",
);

test("Concept Council unwraps async provider settlement before parsing creative output", () => {
  assert.match(source, /value\.raw && typeof value\.raw === "object"/);
  assert.match(source, /value\.raw\?\.output\?\.text/);
});
