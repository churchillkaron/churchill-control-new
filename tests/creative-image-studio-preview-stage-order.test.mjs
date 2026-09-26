import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("canvas closes base effects after light wrap before adjustment and texture stages",()=>{
  const source=fs.readFileSync("components/creative/specialist/ImageStudioCanvasSurface.jsx","utf8");
  const base=source.indexOf("data-base-effect-preview");
  const wrap=source.indexOf("ImageStudioLightWrapPreviewOverlay",base);
  const boundary=source.indexOf("/></div>{adjustmentPreviews",wrap);
  const adjustment=source.indexOf("data-adjustment-preview",boundary);
  const texture=source.indexOf("ImageStudioTexturePreviewOverlay",adjustment);
  assert.ok(base>=0&&wrap>base&&boundary>wrap&&adjustment>boundary&&texture>adjustment);
});

test("version compare closes base effects before adjustment and texture stages",()=>{
  const source=fs.readFileSync("components/creative/specialist/ImageStudioVersionCompare.jsx","utf8");
  const base=source.indexOf("data-compare-base-effect-preview");
  const wrap=source.indexOf("ImageStudioLightWrapPreviewOverlay",base);
  const boundary=source.indexOf("/></div>",wrap);
  const adjustment=source.indexOf("data-compare-adjustment-preview",boundary);
  const texture=source.indexOf("ImageStudioTexturePreviewOverlay",adjustment);
  assert.ok(base>=0&&wrap>base&&boundary>wrap&&adjustment>boundary&&texture>adjustment);
});

test("deterministic export keeps effects before adjustment layers and texture finishing",()=>{
  const source=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js","utf8");
  const effects=source.indexOf("applyImageStudioEffects(prepared");
  const adjustments=source.indexOf("adjustmentLayersForTarget",effects);
  const texture=source.indexOf("applyImageStudioTextureFinishing",adjustments);
  const perspective=source.indexOf("normalizeImageStudioPerspectiveWarp",texture);
  assert.ok(effects>=0&&adjustments>effects&&texture>adjustments&&perspective>texture);
});
