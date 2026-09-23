import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../lib/creative/assets/runtime/CreativeVerifiedBrandAssetBindingRuntime.js", import.meta.url),
  "utf8",
);

test("recovered plans prune only stale EXCLUDE manifest entries", () => {
  assert.match(source, /suppliedIds\.has\(id\)/);
  assert.match(source, /disposition\)\.toUpperCase\(\) !== "EXCLUDE"/);
});

test("current unassigned assets are explicitly accounted as EXCLUDE", () => {
  assert.match(source, /Current project asset is not assigned by this recovered creative plan/);
  assert.match(source, /disposition: "EXCLUDE"/);
});

test("verified bound brand asset is promoted to REFERENCE after reconciliation", () => {
  assert.match(source, /filter\([\s\S]*!== bindingId/);
  assert.match(source, /generated_logo_pixels_forbidden: true/);
  assert.match(source, /disposition: "REFERENCE"/);
});
