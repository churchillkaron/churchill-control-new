import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildImageStudioGroupPatch,
  imageStudioEqualGapGuide,
  imageStudioGroupBounds,
  imageStudioRectContains,
  imageStudioRectsIntersect,
  selectImageStudioLayersInMarquee,
} from "../lib/creative/stills/runtime/CreativeImageStudioInteractionRuntime.js";

test("Image Studio marquee geometry supports intersect and contain selection", () => {
  const layers = [
    { id: "a", bounds: { x: 10, y: 10, width: 50, height: 50 }, visible: true },
    { id: "b", bounds: { x: 70, y: 70, width: 50, height: 50 }, visible: true },
    { id: "locked", bounds: { x: 20, y: 20, width: 20, height: 20 }, visible: true, locked: true },
  ];
  const marquee = { x: 0, y: 0, width: 90, height: 90 };
  assert.equal(imageStudioRectsIntersect(marquee, layers[1].bounds), true);
  assert.equal(imageStudioRectContains(marquee, layers[0].bounds), true);
  assert.deepEqual(selectImageStudioLayersInMarquee(layers, marquee), ["a", "b"]);
  assert.deepEqual(selectImageStudioLayersInMarquee(layers, marquee, { mode: "contain" }), ["a"]);
});

test("Image Studio group patches preserve artboard and parent hierarchy", () => {
  const layers = [
    { id: "a", artboard_id: "board", parent_layer_id: "outer", bounds: { x: 10, y: 20, width: 40, height: 60 } },
    { id: "b", artboard_id: "board", parent_layer_id: "outer", bounds: { x: 80, y: 50, width: 30, height: 20 } },
  ];
  assert.deepEqual(imageStudioGroupBounds(layers), { x: 10, y: 20, width: 100, height: 60 });
  const patch = buildImageStudioGroupPatch(layers, ["a", "b"], "group-1");
  assert.equal(patch.parent_layer_id, "outer");
  assert.deepEqual(patch.child_ids, ["a", "b"]);
  assert.deepEqual(patch.child_patches, [
    { id: "a", parent_layer_id: "group-1" },
    { id: "b", parent_layer_id: "group-1" },
  ]);
});

test("Image Studio equal-gap guide detects professional spacing continuation", () => {
  const siblings = [
    { id: "a", bounds: { x: 0, y: 0, width: 100, height: 100 }, visible: true },
    { id: "b", bounds: { x: 120, y: 0, width: 100, height: 100 }, visible: true },
  ];
  const guide = imageStudioEqualGapGuide({ x: 238, y: 0, width: 100, height: 100 }, siblings, "x", 4);
  assert.equal(guide.gap, 20);
  assert.equal(guide.target, 240);
  assert.equal(guide.delta, 2);
});

test("Image Studio Layers panel supports additive professional selection and hierarchy", () => {
  const panel = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioLayerPanel.jsx", import.meta.url), "utf8");
  assert.match(panel, /event\.shiftKey\|\|event\.metaKey\|\|event\.ctrlKey/);
  assert.match(panel, /toggleLayerSelection/);
  assert.match(panel, /parent_layer_id/);
  assert.match(panel, /FolderTree/);
  assert.match(panel, /selected/);
});
