import assert from "node:assert/strict";
import test from "node:test";
import { resolveCreativeStillReferences } from "../lib/creative/stills/runtime/CreativeStillReferenceIntelligenceRuntime.js";

test("reference intelligence keeps identity, style and composition authority separate", () => {
  const result = resolveCreativeStillReferences({
    assets: [
      { id: "person", asset_type: "image", tags: ["artist portrait"] },
      { id: "look", asset_type: "image", tags: ["style mood lighting"] },
      { id: "layout", asset_type: "image", tags: ["composition layout structure"] },
    ],
    requirements: { identity_required: true, style_required: true, composition_required: true },
  });
  assert.equal(result.ready, true);
  assert.equal(result.by_role.IDENTITY_REFERENCE[0].asset_id, "person");
  assert.equal(result.by_role.STYLE_REFERENCE[0].asset_id, "look");
  assert.equal(result.by_role.COMPOSITION_REFERENCE[0].asset_id, "layout");
  assert.equal(result.by_role.IDENTITY_REFERENCE[0].source_background_policy, "EXCLUDE_UNLESS_EXPLICITLY_ASSIGNED");
});

test("reference intelligence fails closed when required product truth is missing", () => {
  const result = resolveCreativeStillReferences({ assets: [{ id: "style", role: "STYLE_REFERENCE" }], requirements: { product_required: true } });
  assert.equal(result.ready, false);
  assert.deepEqual(result.gaps, ["PRODUCT_REFERENCE_REQUIRED"]);
});
