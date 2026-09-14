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
  assert.match(panel, /selectLayerOrGroup/);
  assert.match(panel, /parent_layer_id/);
  assert.match(panel, /FolderTree/);
  assert.match(panel, /selected/);
});

test("Image Studio canvas wires live marquee selection and equal-gap guides", () => {
  const canvas = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioCanvasSurface.jsx", import.meta.url), "utf8");
  assert.match(canvas, /selectImageStudioLayersInMarquee/);
  assert.match(canvas, /imageStudioEqualGapGuide/);
  assert.match(canvas, /marqueeDraft/);
  assert.match(canvas, /H gap/);
  assert.match(canvas, /V gap/);
  assert.match(canvas, /mode:e\.altKey\?"contain":"intersect"/);
});

test("Image Studio logical groups remain export-safe child layers", () => {
  const store = fs.readFileSync(new URL("../components/creative/specialist/useImageStudioWorkspaceStore.js", import.meta.url), "utf8");
  const toolbar = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioCanvasToolbar.jsx", import.meta.url), "utf8");
  const panel = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioLayerPanel.jsx", import.meta.url), "utf8");
  assert.match(store, /buildImageStudioGroupPatch/);
  assert.match(store, /selectLayerOrGroup/);
  assert.match(store, /groupSelected/);
  assert.match(store, /ungroupSelected/);
  assert.match(store, /parent_layer_id: null/);
  assert.match(toolbar, /Group selection/);
  assert.match(toolbar, /Ungroup selection/);
  assert.match(panel, /selectLayerOrGroup/);
});

test("Image Studio exposes professional group and ungroup shortcuts", () => {
  const shortcuts = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioKeyboardShortcuts.jsx", import.meta.url), "utf8");
  assert.match(shortcuts, /key === "g" && event\.shiftKey/);
  assert.match(shortcuts, /workspace\.ungroupSelected/);
  assert.match(shortcuts, /workspace\.groupSelected/);
});
