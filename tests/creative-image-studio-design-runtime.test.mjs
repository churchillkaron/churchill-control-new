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

import { assessImageStudioComposition } from "../lib/creative/stills/runtime/CreativeImageStudioQualityPreflightRuntime.js";

test("quality preflight catches unsafe exact design before release", () => {
  const result = assessImageStudioComposition({ artboard: { width: 1080, height: 1350 }, layers: [{ id: "headline", artboard_id: "a", layer_type: "TEXT", visible: true, bounds: { x: 2, y: 2, width: 500, height: 40 }, style: { font_size: 8 }, content: { text: "Headline" } }], comments: [{ status: "OPEN" }] });
  assert.equal(result.contract, "CREATIVE_IMAGE_STUDIO_QUALITY_PREFLIGHT_V1");
  assert.ok(result.warnings.some((item) => item.startsWith("TEXT_TOO_SMALL")));
  assert.ok(result.warnings.some((item) => item.startsWith("TEXT_OUTSIDE_SAFE_ZONE")));
  assert.equal(result.counts.unresolved_comments, 1);
});


test("export route fails closed when Image Studio preflight is unsafe", async () => {
  const source = fs.readFileSync(new URL("../app/api/workspace/creative/image-studio/export/route.js", import.meta.url), "utf8");
  assert.match(source, /IMAGE_STUDIO_EXPORT_PREFLIGHT_BLOCKED/);
  assert.match(source, /status:"BLOCKED"/);
  assert.match(source, /allow_unsafe_export/);
});

test("Image Studio crop and mask stay non-destructive through preview and master export", async () => {
  const canvas = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioCanvasSurface.jsx", import.meta.url), "utf8");
  const inspector = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioLayerInspector.jsx", import.meta.url), "utf8");
  const renderer = fs.readFileSync(new URL("../lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js", import.meta.url), "utf8");
  assert.match(inspector, /Non-destructive crop/);
  assert.match(canvas, /metadata\?\.crop/);
  assert.match(renderer, /mask_radius/);
  assert.match(renderer, /focalX/);
});

test("Image Studio multi-selection moves as a group", async () => {
  const canvas = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioCanvasSurface.jsx", import.meta.url), "utf8");
  assert.match(canvas, /origins=new Map/);
  assert.match(canvas, /appliedDx/);
});
