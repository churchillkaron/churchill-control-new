import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { imageStudioEdgePreview } from "../lib/creative/stills/runtime/CreativeImageStudioEdgePreviewRuntime.js";
import { imageStudioLightWrapPreview } from "../lib/creative/stills/runtime/CreativeImageStudioContactPreviewRuntime.js";

test("positive matte choke previews as scaled alpha erosion",()=>{
  const preview=imageStudioEdgePreview({style:{edge_integration:{matte_choke_px:3}},scale:2});
  assert.equal(preview.preview_supported,true);
  assert.equal(preview.radius,6);
  assert.equal(preview.alpha_changes,true);
  assert.deepEqual(preview.export_only_reasons,[]);
});

test("positive choke can preview alpha while color cleanup remains export authoritative",()=>{
  const preview=imageStudioEdgePreview({style:{edge_integration:{matte_choke_px:2,despill_strength:.5}},scale:1});
  assert.equal(preview.preview_supported,true);
  assert.equal(preview.partial_preview,true);
  assert.ok(preview.export_only_reasons.includes("EDGE_COLOR_CLEANUP_EXPORT_ONLY"));
});

test("edge expansion and soften fail conservative because export propagates RGB",()=>{
  const expand=imageStudioEdgePreview({style:{edge_integration:{matte_choke_px:-2}}});
  const soften=imageStudioEdgePreview({style:{edge_integration:{edge_soften_px:3}}});
  assert.equal(expand.preview_supported,false);
  assert.equal(expand.reason,"EDGE_EXPANSION_RGB_PROPAGATION_REQUIRED");
  assert.equal(soften.preview_supported,false);
  assert.equal(soften.reason,"EDGE_SOFTEN_RGB_PROPAGATION_REQUIRED");
});

test("masked or frame-masked choke stays export authoritative because export processes post-mask alpha",()=>{
  for(const options of [{has_mask:true},{has_frame_mask:true}]){
    const preview=imageStudioEdgePreview({style:{edge_integration:{matte_choke_px:2}},...options});
    assert.equal(preview.preview_supported,false);
    assert.equal(preview.reason,"POST_MASK_ALPHA_REQUIRED");
  }
});

test("disabled edge integration is explicitly inert",()=>{
  const preview=imageStudioEdgePreview({style:{}});
  assert.equal(preview.preview_supported,false);
  assert.equal(preview.reason,"EDGE_INTEGRATION_DISABLED");
  assert.equal(preview.alpha_changes,false);
});

test("edge preview filter uses SourceAlpha erosion without inventing RGB",()=>{
  const source=fs.readFileSync("components/creative/specialist/ImageStudioEdgePreviewFilterDefs.jsx","utf8");
  assert.match(source,/feMorphology/);
  assert.match(source,/operator="erode"/);
  assert.match(source,/SourceAlpha/);
  assert.match(source,/feComposite/);
  assert.match(source,/SourceGraphic/);
});

test("simple positive edge erosion feeds the light wrap preview post-edge alpha boundary",()=>{
  const edge=imageStudioEdgePreview({style:{edge_integration:{matte_choke_px:2}},scale:1});
  const preview=imageStudioLightWrapPreview({
    style:{contact_realism:{light_wrap_strength:.5,light_wrap_width_px:6}},
    asset_url:"https://example.com/a.png",preview:{image:{width:200,height:100}},edge_preview:edge,
  });
  assert.equal(preview.preview_supported,true);
  assert.equal(preview.edge_radius,2);
  assert.equal(preview.fidelity,"APPROXIMATE_RASTER_EXACT_EDGE_BOUNDARY_CONCEPT");
});

test("unsupported edge alpha pipelines keep light wrap export-authoritative",()=>{
  const edge=imageStudioEdgePreview({style:{edge_integration:{edge_soften_px:2}},scale:1});
  const preview=imageStudioLightWrapPreview({
    style:{contact_realism:{light_wrap_strength:.5,light_wrap_width_px:6}},
    asset_url:"https://example.com/a.png",preview:{image:{width:200,height:100}},edge_preview:edge,
  });
  assert.equal(preview.preview_supported,false);
  assert.equal(preview.reason,"EDGE_FINISHED_LIGHT_WRAP_EXPORT_ONLY");
});

test("canvas and compare share the edge preview and explicit export-only contract",()=>{
  const canvas=fs.readFileSync("components/creative/specialist/ImageStudioCanvasSurface.jsx","utf8");
  const compare=fs.readFileSync("components/creative/specialist/ImageStudioVersionCompare.jsx","utf8");
  assert.match(canvas,/ImageStudioEdgePreviewFilterDefs/);
  assert.match(canvas,/data-edge-alpha-preview/);
  assert.match(canvas,/Edge cleanup · deterministic export only/);
  assert.match(compare,/ImageStudioEdgePreviewFilterDefs/);
  assert.match(compare,/data-compare-edge-alpha-preview/);
  assert.match(compare,/edgeExportOnly/);
});

test("renderer stage order remains retouch then edge then light wrap then adjustments then texture",()=>{
  for(const file of ["components/creative/specialist/ImageStudioCanvasSurface.jsx","components/creative/specialist/ImageStudioVersionCompare.jsx"]){
    const source=fs.readFileSync(file,"utf8");
    const edge=source.indexOf(file.includes("VersionCompare")?"data-compare-edge-alpha-preview":"data-edge-alpha-preview");
    const retouch=source.indexOf("imageStudioRetouchPreviewStyle(operation",edge);
    const wrap=source.indexOf("ImageStudioLightWrapPreviewOverlay",edge);
    const adjustment=source.indexOf("adjustment-preview",wrap);
    const texture=source.indexOf("ImageStudioTexturePreviewOverlay",adjustment);
    assert.ok(edge>=0&&retouch>edge&&wrap>retouch&&adjustment>wrap&&texture>adjustment,file+" stage order");
  }
});

test("deterministic export runs image retouch before edge cleanup and never twice",()=>{
  const source=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js","utf8");
  const imageLoop=source.indexOf("for (const layer of visible)");
  const imageBranch=source.indexOf("if (!layer.source_asset_id)",imageLoop);
  const retouch=source.indexOf("const retouchOperations=Array.isArray(layer.style?.retouch_operations)",imageBranch);
  const edge=source.indexOf("const edgeSettings=layer.style?.edge_integration",retouch);
  const wrap=source.indexOf("const contactSettings=layer.style?.contact_realism",edge);
  const effects=source.indexOf("applyImageStudioEffects(prepared, layer.style || {}, {apply_retouch:false})",wrap);
  const adjustments=source.indexOf("adjustmentLayersForTarget",effects);
  const texture=source.indexOf("applyImageStudioTextureFinishing",adjustments);
  const perspective=source.indexOf("normalizeImageStudioPerspectiveWarp",texture);
  assert.ok(retouch>imageBranch&&edge>retouch&&wrap>edge&&effects>wrap&&adjustments>effects&&texture>adjustments&&perspective>texture);
  assert.match(source,/apply_retouch && Array\.isArray\(style\.retouch_operations\)/);
});
