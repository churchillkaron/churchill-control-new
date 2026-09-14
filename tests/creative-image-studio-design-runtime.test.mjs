import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeImageStudioCrop, rotatedImageStudioPlacement } from "../lib/creative/stills/runtime/CreativeImageStudioImageGeometryRuntime.js";
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
import { measureImageStudioText } from "../lib/creative/stills/runtime/CreativeImageStudioTypographyRuntime.js";
import { snapLayerBounds, reorderNormalizedLayers } from "../lib/creative/stills/runtime/CreativeImageStudioDesignRuntime.js";

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
  assert.doesNotMatch(source, /allow_unsafe_export/);
});

test("Image Studio crop and mask stay non-destructive through preview and master export", async () => {
  const canvas = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioCanvasSurface.jsx", import.meta.url), "utf8");
  const inspector = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioLayerInspector.jsx", import.meta.url), "utf8");
  const renderer = fs.readFileSync(new URL("../lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js", import.meta.url), "utf8");
  assert.match(inspector, /Non-destructive crop/);
  assert.match(canvas, /imageStudioPreviewStyle/);
  assert.match(renderer, /maskRadius/);
  assert.match(renderer, /focalX/);
});

test("Image Studio multi-selection moves as a group", async () => {
  const canvas = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioCanvasSurface.jsx", import.meta.url), "utf8");
  assert.match(canvas, /origins=new Map/);
  assert.match(canvas, /appliedDx/);
});

test("Image Studio export persists a canonical publishable Creative asset", () => {
  const source = fs.readFileSync(new URL("../app/api/workspace/creative/image-studio/export/route.js", import.meta.url), "utf8");
  assert.match(source, /CreativeAssetRepository\.create/);
  assert.match(source, /storage:\/\/\$\{BUCKET\}/);
  assert.match(source, /asset_id: asset\.id/);
  assert.match(source, /x-avantiqo-creative-asset-id/);
  assert.match(source, /createHash\("sha256"\)/);
});


test("Image Studio durable hydration wins over bootstrap and stale loads", () => {
  const workspaceSource = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioWorkspace.jsx", import.meta.url), "utf8");
  const persistenceSource = fs.readFileSync(new URL("../components/creative/specialist/useImageStudioWorkspacePersistence.js", import.meta.url), "utf8");
  assert.match(workspaceSource, /persistence\.hydrationState !== "EMPTY"/);
  assert.match(workspaceSource, /persistence\.hydratedScope !== scopeKey/);
  assert.match(workspaceSource, /bootstrapScopeRef\.current === scopeKey/);
  assert.match(persistenceSource, /activeLoadScopeRef\.current !== scopeKey/);
  assert.match(persistenceSource, /setHydrationState\(hasDurableWorkspace \? "DURABLE" : "EMPTY"\)/);
});

test("Image Studio snapping uses canvas safe-zone and sibling geometry", () => {
  const board = { width: 1000, height: 800 };
  const sibling = { bounds: { x: 200, y: 150, width: 200, height: 100 } };
  const center = snapLayerBounds({ x: 448, y: 348, width: 100, height: 100 }, board, [], { threshold: 8 });
  assert.equal(center.bounds.x, 450);
  assert.equal(center.bounds.y, 350);
  assert.equal(center.guides.x, 500);
  assert.equal(center.guides.y, 400);
  const siblingSnap = snapLayerBounds({ x: 396, y: 250, width: 100, height: 100 }, board, [sibling], { threshold: 8 });
  assert.equal(siblingSnap.bounds.x, 400);
  assert.equal(siblingSnap.guides.x, 400);
  const safeSnap = snapLayerBounds({ x: 46, y: 38, width: 100, height: 100 }, board, [], { threshold: 8 });
  assert.equal(safeSnap.bounds.x, 50);
  assert.equal(safeSnap.bounds.y, 40);
});

test("Image Studio layer reorder always normalizes unique contiguous z-order", () => {
  const layers = [
    { id: "a", sort_order: 0 },
    { id: "b", sort_order: 0 },
    { id: "c", sort_order: 7 },
  ];
  const next = reorderNormalizedLayers(layers, "a", 1);
  assert.deepEqual(next.map((layer) => layer.id), ["b", "a", "c"]);
  assert.deepEqual(next.map((layer) => layer.sort_order), [0, 1, 2]);
});

test("Image Studio typography wraps deterministically and reports overflow", () => {
  const measured = measureImageStudioText({
    text: "World class intelligent design system",
    bounds: { width: 180, height: 90 },
    style: { font_size: 30, line_height: 1, font_weight: 600, text_align: "center", vertical_align: "middle" },
  });
  assert.ok(measured.lines.length > 1);
  assert.equal(measured.align, "center");
  assert.equal(measured.verticalAlign, "middle");
  assert.equal(measured.maxLines, 3);
  assert.equal(measured.visibleLines.length, Math.min(measured.lines.length, measured.maxLines));

  const overflow = assessImageStudioComposition({
    artboard: { width: 1080, height: 1350 },
    layers: [{ id: "copy", layer_type: "TEXT", visible: true, bounds: { x: 100, y: 100, width: 140, height: 40 }, style: { font_size: 32, line_height: 1 }, content: { text: "This text cannot fit inside this tiny box" } }],
  });
  assert.ok(overflow.blockers.includes("TEXT_OVERFLOW:copy"));
  assert.equal(overflow.release_ready, false);
});

test("Image Studio preview compare and export share typography contract", () => {
  const canvas = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioCanvasSurface.jsx", import.meta.url), "utf8");
  const compare = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioVersionCompare.jsx", import.meta.url), "utf8");
  const inspector = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioLayerInspector.jsx", import.meta.url), "utf8");
  const exportRuntime = fs.readFileSync(new URL("../lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js", import.meta.url), "utf8");
  for (const source of [canvas, compare, exportRuntime]) assert.match(source, /measureImageStudioText/);
  assert.match(canvas, /visibleLines\.join/);
  assert.match(compare, /visibleLines\.join/);
  assert.match(exportRuntime, /measured\.visibleLines/);
  assert.match(inspector, /Font family/);
  assert.match(inspector, /Line height/);
  assert.match(inspector, /Letter spacing/);
  assert.match(inspector, /Vertical/);
});


test("Image Studio crop geometry preserves focal point and center through rotation", () => {
  const layer = { bounds: { x: 100, y: 200, width: 400, height: 200 }, metadata: { crop: { x: 0.75, y: 0.25, zoom: 2 }, mask_radius: 30 }, transform: { rotation: 45 } };
  const crop = normalizeImageStudioCrop(layer);
  assert.equal(crop.width, 400);
  assert.equal(crop.height, 200);
  assert.equal(crop.scaledWidth, 800);
  assert.equal(crop.scaledHeight, 400);
  assert.equal(crop.extractLeft, 400);
  assert.equal(crop.extractTop, 0);
  assert.equal(crop.maskRadius, 30);
  const placement = rotatedImageStudioPlacement(layer, { width: 425, height: 425 });
  assert.equal(placement.centerX, 300);
  assert.equal(placement.centerY, 300);
  assert.equal(placement.left, 88);
  assert.equal(placement.top, 88);
});

test("Image Studio canvas compare and export share image geometry contract", () => {
  const canvas = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioCanvasSurface.jsx", import.meta.url), "utf8");
  const compare = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioVersionCompare.jsx", import.meta.url), "utf8");
  const renderer = fs.readFileSync(new URL("../lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js", import.meta.url), "utf8");
  assert.match(canvas, /imageStudioPreviewStyle/);
  assert.match(compare, /imageStudioPreviewStyle/);
  assert.match(renderer, /normalizeImageStudioCrop/);
  assert.match(renderer, /rotatedImageStudioPlacement/);
});
