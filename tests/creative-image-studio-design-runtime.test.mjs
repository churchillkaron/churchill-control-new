import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeImageStudioCrop, rotatedImageStudioPlacement, imageStudioSourceCropGeometry, imageStudioPreviewGeometry, clipImageStudioCompositePlacement } from "../lib/creative/stills/runtime/CreativeImageStudioImageGeometryRuntime.js";
import {
  IMAGE_STUDIO_FORMAT_PRESETS,
  adaptBoundsToArtboard,
  alignLayers,
  buildSafeZone,
  distributeLayers,
  clampImageStudioZoom,
  fitImageStudioZoom,
  snapResizeBounds,
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



test("Image Studio zoom fit and resize geometry stay deterministic", () => {
  assert.equal(clampImageStudioZoom(5), 3);
  assert.equal(clampImageStudioZoom(0.05), 0.2);
  assert.equal(fitImageStudioZoom({ width: 1000, height: 500 }, { width: 600, height: 400 }, 100), 0.5);
  const snapped = snapResizeBounds({ x: 100, y: 100, width: 394, height: 194 }, { width: 1000, height: 800 }, [{ bounds: { x: 500, y: 300, width: 120, height: 100 } }], { threshold: 8 });
  assert.equal(snapped.bounds.width, 400);
  assert.equal(snapped.bounds.height, 200);
  assert.equal(snapped.guides.x, 500);
  assert.equal(snapped.guides.y, 300);
  const locked = snapResizeBounds({ x: 100, y: 100, width: 394, height: 180 }, { width: 1000, height: 800 }, [{ bounds: { x: 500, y: 300, width: 120, height: 100 } }], { threshold: 8, preserveAspect: true, aspectRatio: 2 });
  assert.equal(locked.bounds.width, 400);
  assert.equal(locked.bounds.height, 200);
});

test("Image Studio canvas supports real zoom fit actual size and snapped aspect resize", () => {
  const canvas = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioCanvasSurface.jsx", import.meta.url), "utf8");
  const toolbar = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioCanvasToolbar.jsx", import.meta.url), "utf8");
  const store = fs.readFileSync(new URL("../components/creative/specialist/useImageStudioWorkspaceStore.js", import.meta.url), "utf8");
  assert.doesNotMatch(canvas, /Math\.min\(1,workspace\.viewport\.zoom\)/);
  assert.match(canvas, /clampImageStudioZoom/);
  assert.match(canvas, /fitImageStudioZoom/);
  assert.match(canvas, /snapResizeBounds/);
  assert.match(canvas, /preserveAspect=e\.shiftKey/);
  assert.match(toolbar, /Fit to view/);
  assert.match(toolbar, /Actual size/);
  assert.match(store, /requestFitToView/);
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
  assert.equal(result.contract, "CREATIVE_IMAGE_STUDIO_QUALITY_PREFLIGHT_V2");
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
  assert.match(canvas, /imageStudioPreviewGeometry/);
  assert.match(renderer, /maskRadius/);
  assert.match(renderer, /imageStudioSourceCropGeometry/);
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
  assert.match(canvas, /imageStudioPreviewGeometry/);
  assert.match(compare, /imageStudioPreviewGeometry/);
  assert.match(renderer, /imageStudioSourceCropGeometry/);
  assert.match(renderer, /rotatedImageStudioPlacement/);
});


test("Image Studio source crop geometry matches explicit preview and export windows", () => {
  const layer = { bounds: { x: 0, y: 0, width: 400, height: 400 }, metadata: { crop: { x: 0.75, y: 0.5, zoom: 1.5 }, mask_radius: 20 } };
  const geometry = imageStudioSourceCropGeometry(layer, { width: 1600, height: 900 });
  assert.equal(geometry.scaledWidth, 600);
  assert.equal(geometry.scaledHeight, 600);
  assert.equal(geometry.renderedWidth, 1067);
  assert.equal(geometry.renderedHeight, 600);
  assert.equal(geometry.coverLeft, 467);
  assert.equal(geometry.coverTop, 0);
  assert.equal(geometry.extractLeft, 200);
  assert.equal(geometry.extractTop, 100);
  const preview = imageStudioPreviewGeometry(layer, { width: 1600, height: 900 }, 0.5);
  assert.deepEqual(preview.frame, { width: 200, height: 200, borderRadius: 10 });
  assert.equal(preview.image.left, -333.5);
  assert.equal(preview.image.top, -50);
  assert.equal(preview.image.width, 533.5);
  assert.equal(preview.image.height, 300);
});


test("Image Studio clips rotated composites exactly to the artboard", () => {
  const leftTop = clipImageStudioCompositePlacement({ left: -30, top: -20, renderedWidth: 140, renderedHeight: 120 }, { width: 100, height: 100 });
  assert.deepEqual(leftTop, { visible: true, left: 0, top: 0, width: 100, height: 100, extractLeft: 30, extractTop: 20 });
  const rightBottom = clipImageStudioCompositePlacement({ left: 70, top: 80, renderedWidth: 80, renderedHeight: 60 }, { width: 100, height: 100 });
  assert.deepEqual(rightBottom, { visible: true, left: 70, top: 80, width: 30, height: 20, extractLeft: 0, extractTop: 0 });
  const outside = clipImageStudioCompositePlacement({ left: 120, top: 20, renderedWidth: 30, renderedHeight: 30 }, { width: 100, height: 100 });
  assert.equal(outside.visible, false);
  const renderer = fs.readFileSync(new URL("../lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js", import.meta.url), "utf8");
  assert.match(renderer, /clipImageStudioCompositePlacement/);
  assert.match(renderer, /if \(!clipped\.visible\) continue/);
  assert.match(renderer, /left: clipped\.extractLeft/);
});

test("Image Studio selection geometry supports eight-handle group transforms and rotation snapping", async () => {
  const design = await import("../lib/creative/stills/runtime/CreativeImageStudioDesignRuntime.js");
  const layers = [
    { id: "a", bounds: { x: 100, y: 100, width: 100, height: 100 } },
    { id: "b", bounds: { x: 300, y: 200, width: 200, height: 100 } },
  ];
  const group = design.selectionBounds(layers);
  assert.deepEqual(group, { x: 100, y: 100, width: 400, height: 200 });
  const resized = design.resizeBoundsFromHandle(group, "nw", 40, 20, { minSize: 24 });
  assert.deepEqual(resized, { x: 140, y: 120, width: 360, height: 180 });
  const scaled = design.scaleLayersFromSelection(layers, group, resized);
  assert.deepEqual(scaled[0].bounds, { x: 140, y: 120, width: 90, height: 90 });
  assert.deepEqual(scaled[1].bounds, { x: 320, y: 210, width: 180, height: 90 });
  assert.equal(design.snapRotation(43, 45, 4), 45);
  assert.equal(design.snapRotation(31, 45, 4), 31);
});

test("Image Studio exposes full transform handles and multi-select composition controls", () => {
  const canvas = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioCanvasSurface.jsx", import.meta.url), "utf8");
  const inspector = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioLayerInspector.jsx", import.meta.url), "utf8");
  const toolbar = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioCanvasToolbar.jsx", import.meta.url), "utf8");
  assert.match(canvas, /const HANDLES=/);
  assert.match(canvas, /"nw"/);
  assert.match(canvas, /"se"/);
  assert.match(canvas, /Rotate selection/);
  assert.match(canvas, /scaleLayersFromSelection/);
  assert.match(inspector, /Distribute H/);
  assert.match(inspector, /Center Y/);
  assert.match(toolbar, /Toggle grid and safe zone/);
});

test("Image Studio group rotation preserves orbital geometry around the selection center", async () => {
  const design = await import("../lib/creative/stills/runtime/CreativeImageStudioDesignRuntime.js");
  const layers = [
    { id: "left", bounds: { x: 0, y: 50, width: 50, height: 50 }, transform: { rotation: 0 } },
    { id: "right", bounds: { x: 150, y: 50, width: 50, height: 50 }, transform: { rotation: 10 } },
  ];
  const selection = { x: 0, y: 50, width: 200, height: 50 };
  const rotated = design.rotateLayersAroundSelection(layers, selection, 90);
  assert.equal(Math.round(rotated[0].bounds.x), 75);
  assert.equal(Math.round(rotated[0].bounds.y), -25);
  assert.equal(Math.round(rotated[1].bounds.x), 75);
  assert.equal(Math.round(rotated[1].bounds.y), 125);
  assert.equal(rotated[0].transform.rotation, 90);
  assert.equal(rotated[1].transform.rotation, 100);
});

test("Image Studio binds text preview and export to the same exact governed font asset", () => {
  const canvas = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioCanvasSurface.jsx", import.meta.url), "utf8");
  const inspector = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioLayerInspector.jsx", import.meta.url), "utf8");
  const toolbar = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioCanvasToolbar.jsx", import.meta.url), "utf8");
  const fontHook = fs.readFileSync(new URL("../components/creative/specialist/useImageStudioFonts.js", import.meta.url), "utf8");
  const fontRuntime = fs.readFileSync(new URL("../lib/creative/stills/runtime/CreativeImageStudioFontRuntime.js", import.meta.url), "utf8");
  const exportRuntime = fs.readFileSync(new URL("../lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js", import.meta.url), "utf8");
  const preflight = fs.readFileSync(new URL("../lib/creative/stills/runtime/CreativeImageStudioQualityPreflightRuntime.js", import.meta.url), "utf8");
  const route = fs.readFileSync(new URL("../app/api/workspace/creative/image-studio/font/route.js", import.meta.url), "utf8");
  assert.match(toolbar, /font_asset_id:"platform-font:inter"/);
  assert.match(inspector, /Font family \/ exact asset/);
  assert.match(fontHook, /new FontFace/);
  assert.match(canvas, /fonts\.fontFamilyFor/);
  assert.match(fontRuntime, /resolveCreativeDesignFont/);
  assert.match(fontRuntime, /ORGANIZATION_FONT/);
  assert.match(route, /requireOrganizationAccess/);
  assert.match(route, /materializeImageStudioFont/);
  assert.match(exportRuntime, /renderFontFaces/);
  assert.match(exportRuntime, /font\.bytes\.toString\("base64"\)/);
  assert.match(exportRuntime, /CREATIVE_IMAGE_STUDIO_DETERMINISTIC_EXPORT_V2/);
  assert.match(preflight, /FONT_ASSET_MISSING/);
});

test("Image Studio effects normalize safely and preserve preview/export parity", async () => {
  const effects = await import("../lib/creative/stills/runtime/CreativeImageStudioEffectsRuntime.js");
  const normalized = effects.normalizeImageStudioEffects({
    opacity: 2,
    blend_mode: "multiply",
    effects: { brightness: 3, contrast: 0, saturation: -1, hue: 999, grayscale: 2, blur: 99 },
  });
  assert.equal(normalized.opacity, 1);
  assert.equal(normalized.brightness, 2);
  assert.equal(normalized.contrast, 0.25);
  assert.equal(normalized.saturation, 0);
  assert.equal(normalized.hue, 180);
  assert.equal(normalized.grayscale, 1);
  assert.equal(normalized.blur, 40);
  assert.equal(normalized.css_blend_mode, "multiply");
  assert.equal(normalized.sharp_blend_mode, "multiply");
  const preview = effects.imageStudioPreviewEffectStyle({ effects: { brightness: 1.2, blur: 4 } });
  assert.match(preview.filter, /brightness\(1\.2\)/);
  assert.match(preview.filter, /blur\(4px\)/);
});

test("Image Studio exposes Photoshop-class non-destructive image adjustments in canvas and deterministic export", () => {
  const canvas = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioCanvasSurface.jsx", import.meta.url), "utf8");
  const inspector = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioLayerInspector.jsx", import.meta.url), "utf8");
  const exportRuntime = fs.readFileSync(new URL("../lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js", import.meta.url), "utf8");
  assert.match(canvas, /imageStudioPreviewEffectStyle/);
  assert.match(canvas, /mixBlendMode:effects\.mixBlendMode/);
  assert.match(inspector, /Non-destructive effects/);
  assert.match(inspector, /Brightness %/);
  assert.match(inspector, /Saturation %/);
  assert.match(inspector, /Reset effects/);
  assert.match(exportRuntime, /applyImageStudioEffects/);
  assert.match(exportRuntime, /\.modulate\(/);
  assert.match(exportRuntime, /\.linear\(/);
  assert.match(exportRuntime, /sharp_blend_mode/);
  assert.match(exportRuntime, /CREATIVE_IMAGE_STUDIO_EFFECTS_V1/);
});

test("Image Studio smart format adaptation preserves full bleed, safe typography, focal identity and exact styles", async () => {
  const design = await import("../lib/creative/stills/runtime/CreativeImageStudioDesignRuntime.js");
  const source = { id: "feed", width: 1080, height: 1350 };
  const target = { id: "story", width: 1080, height: 1920 };
  const background = design.adaptLayerToArtboard({ id: "bg", layer_type: "IMAGE", bounds: { x: 0, y: 0, width: 1080, height: 1350 }, metadata: { focal_point: { x: 0.7, y: 0.4 } } }, source, target);
  assert.deepEqual(background.bounds, { x: 0, y: 0, width: 1080, height: 1920 });
  assert.equal(background.metadata.responsive_strategy, "FULL_BLEED_COVER");

  const textLayer = design.adaptLayerToArtboard({ id: "headline", layer_type: "TEXT", bounds: { x: 40, y: 30, width: 1000, height: 220 }, style: { font_asset_id: "platform-font:inter", font_family: "Inter", font_size: 80, letter_spacing: 2 }, metadata: {} }, source, target);
  const safe = design.buildSafeZone(target);
  assert.ok(textLayer.bounds.x >= safe.x);
  assert.ok(textLayer.bounds.y >= safe.y);
  assert.ok(textLayer.bounds.x + textLayer.bounds.width <= safe.x + safe.width + 0.001);
  assert.equal(textLayer.style.font_asset_id, "platform-font:inter");
  assert.equal(textLayer.metadata.responsive_strategy, "SAFE_ZONE_TYPOGRAPHY");

  const brand = design.adaptLayerToArtboard({ id: "logo", layer_type: "IMAGE", bounds: { x: 800, y: 80, width: 180, height: 100 }, metadata: { brand_locked: true, focal_point: { x: 0.85, y: 0.08 } } }, source, target);
  assert.equal(brand.metadata.brand_locked, true);
  assert.equal(brand.metadata.responsive_strategy, "BRAND_LOCKED_FOCAL");
});

test("Image Studio format duplication uses role-aware smart adaptation instead of blind resize", () => {
  const store = fs.readFileSync(new URL("../components/creative/specialist/useImageStudioWorkspaceStore.js", import.meta.url), "utf8");
  const bar = fs.readFileSync(new URL("../components/creative/specialist/ImageStudioFormatBar.jsx", import.meta.url), "utf8");
  assert.match(store, /adaptLayerToArtboard/);
  assert.match(store, /duplicateArtboardLocal/);
  assert.match(bar, /Smart adapt as/);
});


test("Image Studio world-class preflight catches collisions, weak hierarchy and low contrast", () => {
  const result = assessImageStudioComposition({
    artboard: { width: 1080, height: 1350, background: { color: "#ffffff" } },
    layers: [
      { id: "headline", layer_type: "TEXT", visible: true, bounds: { x: 100, y: 100, width: 600, height: 120 }, style: { font_asset_id: "platform-font:inter", font_size: 40, color: "#dddddd" }, content: { text: "Headline" } },
      { id: "subhead", layer_type: "TEXT", visible: true, bounds: { x: 120, y: 120, width: 560, height: 110 }, style: { font_asset_id: "platform-font:inter", font_size: 36, color: "#eeeeee" }, content: { text: "Subhead" } },
    ],
  });
  assert.equal(result.contract, "CREATIVE_IMAGE_STUDIO_QUALITY_PREFLIGHT_V2");
  assert.equal(result.release_threshold, 95);
  assert.ok(result.warnings.some((item) => item.startsWith("TEXT_COLLISION")));
  assert.ok(result.warnings.some((item) => item.startsWith("TYPOGRAPHIC_HIERARCHY_WEAK")));
  assert.ok(result.warnings.some((item) => item.startsWith("TEXT_CONTRAST_LOW")));
  assert.equal(result.release_ready, false);
});

test("Image Studio world-class preflight blocks critical review debt and bad print resolution", () => {
  const result = assessImageStudioComposition({
    artboard: { width: 2480, height: 3508, export_preset: { id: "a4_print" } },
    layers: [
      { id: "hero", layer_type: "IMAGE", visible: true, source_asset_id: "asset-1", bounds: { x: 0, y: 0, width: 2480, height: 3508 }, metadata: { source_dimensions: { width: 700, height: 900 }, target_dpi: 300 } },
    ],
    comments: [{ status: "OPEN", severity: "BLOCKER" }],
  });
  assert.ok(result.blockers.some((item) => item.startsWith("PRINT_IMAGE_RESOLUTION_CRITICAL")));
  assert.ok(result.blockers.includes("CRITICAL_REVIEW_COMMENTS_OPEN"));
  assert.equal(result.checks.review_closed, false);
  assert.equal(result.release_ready, false);
});

test("Image Studio export records the actual preflight contract that blocked release", () => {
  const source = fs.readFileSync(new URL("../app/api/workspace/creative/image-studio/export/route.js", import.meta.url), "utf8");
  assert.match(source, /blocked_by: preflight\.contract/);
});
