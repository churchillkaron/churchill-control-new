import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const source = fs.readFileSync(
  "lib/creative/director/validation/CreativeMasterPlanDecisionGate.js",
  "utf8",
);

test("semantic mission rejects invisible technology when mechanism and universe scale are required", () => {
  assert.match(source, /SEMANTIC_CORE_MECHANISM_NOT_DRAMATIZED/);
  assert.match(source, /SEMANTIC_TECHNOLOGY_FUTURE_LANGUAGE_MISSING/);
  assert.match(source, /SEMANTIC_UNIVERSE_SCALE_MISSING/);
  assert.match(source, /never shown\|not shown/);
  assert.match(source, /Universe-scale visual language is required in the requested excerpt/);
});
