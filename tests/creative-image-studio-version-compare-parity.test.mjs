import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("version compare snapshot uses current Image Studio rendering contracts",()=>{
  const source=fs.readFileSync("components/creative/specialist/ImageStudioVersionCompare.jsx","utf8");
  assert.match(source,/imageStudioPreviewEffectStyle/);
  assert.match(source,/imageStudioMaskPreviewStyle/);
  assert.match(source,/imageStudioAdjustmentPreviewDescriptors/);
  assert.match(source,/imageStudioGroundShadowPreview/);
  assert.match(source,/useImageStudioFonts/);
  assert.match(source,/fonts\.fontFamilyFor/);
});

test("version compare does not render control-only adjustment and mask layers as artwork",()=>{
  const source=fs.readFileSync("components/creative/specialist/ImageStudioVersionCompare.jsx","utf8");
  assert.match(source,/layer\.layer_type!==\"ADJUSTMENT\"/);
  assert.match(source,/layer\.layer_type!==\"MASK\"/);
  assert.match(source,/layer\.metadata\?\.is_clip_mask!==true/);
});

test("version compare previews supported adjustment layers and contact shadows",()=>{
  const source=fs.readFileSync("components/creative/specialist/ImageStudioVersionCompare.jsx","utf8");
  assert.match(source,/data-compare-adjustment-preview/);
  assert.match(source,/backdropFilter:item\.filter/);
  assert.match(source,/data-compare-contact-shadow/);
  assert.match(source,/shadowPreview\.outer_style/);
  assert.match(source,/shadowPreview\.silhouette_style/);
});

test("version compare explicitly identifies unsupported complex preview effects",()=>{
  const source=fs.readFileSync("components/creative/specialist/ImageStudioVersionCompare.jsx","utf8");
  assert.match(source,/Complex effects · deterministic export only/);
  assert.match(source,/adjustment\.some\(\(item\)=>!item\.preview_supported\)/);
  assert.match(source,/shadow\.shadow\?\.enabled&&!shadow\.preview_supported/);
});

test("version compare snapshot applies layer effect opacity blend and image filter",()=>{
  const source=fs.readFileSync("components/creative/specialist/ImageStudioVersionCompare.jsx","utf8");
  assert.match(source,/opacity:effects\.opacity/);
  assert.match(source,/mixBlendMode:effects\.mixBlendMode/);
  assert.match(source,/filter:effects\.filter/);
});
