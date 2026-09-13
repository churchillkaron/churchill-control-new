import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  IMAGE_STUDIO_FORMAT_PRESETS,
  adaptBoundsToArtboard,
  alignLayers,
  buildSafeZone,
  distributeLayers,
} from "../lib/creative/stills/runtime/CreativeImageStudioDesignRuntime.js";

test("Image Studio exposes practical multi-format presets and safe zones", () => {
  assert.ok(IMAGE_STUDIO_FORMAT_PRESETS.some((item) => item.id === "instagram_portrait"));
  assert.ok(IMAGE_STUDIO_FORMAT_PRESETS.some((item) => item.id === "a4_print"));
  assert.deepEqual(buildSafeZone({ width: 1000, height: 2000 }), { x: 50, y: 100, width: 900, height: 1800 });
});

test("format adaptation preserves focal placement while changing aspect ratio", () => {
  const result = adaptBoundsToArtboard({ x: 100, y: 100, width: 400, height: 400 }, { width: 1000, height: 1000 }, { width: 1000, height: 2000 }, { x: 0.3, y: 0.3 });
  assert.equal(result.width, 400);
  assert.equal(result.height, 400);
  assert.equal(result.x, 100);
  assert.equal(result.y, 400);
});

test("alignment and distribution remain deterministic", () => {
  const layers = [
    { id: "a", bounds: { x: 20, y: 10, width: 100, height: 50 } },
    { id: "b", bounds: { x: 220, y: 20, width: 100, height: 50 } },
    { id: "c", bounds: { x: 500, y: 30, width: 100, height: 50 } },
  ];
  assert.deepEqual(alignLayers(layers, { width: 1000, height: 1000 }, "center_x").map((x) => x.bounds.x), [450, 450, 450]);
  assert.deepEqual(distributeLayers(layers, "x").map((x) => Math.round(x.bounds.x)), [20, 260, 500]);
});

test("deterministic export runtime owns PNG JPEG and PDF master composition", () => {
  const source = fs.readFileSync(new URL("../lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js", import.meta.url), "utf8");
  assert.match(source, /CREATIVE_IMAGE_STUDIO_DETERMINISTIC_EXPORT_V1/);
  assert.match(source, /sharp\(/);
  assert.match(source, /target === "JPEG"/);
  assert.match(source, /target === "PDF"/);
  assert.match(source, /await import\("pdf-lib"\)/);
  assert.match(source, /source_asset_id/);
});
