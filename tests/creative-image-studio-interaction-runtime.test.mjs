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

test("Image Studio reusable design runtime persists exact styles and component lineage", async () => {
  const reusable = await import("../lib/creative/stills/runtime/CreativeImageStudioReusableDesignRuntime.js");
  const layer = { id:"title", artboard_id:"board", layer_type:"TEXT", name:"Title", bounds:{x:10,y:20,width:200,height:80}, style:{font_asset_id:"platform-font:inter",font_size:64,color:"#111111"}, content:{text:"Hello"}, metadata:{} };
  const style = reusable.buildImageStudioStyleDefinition(layer,{id:"style-1",name:"Headline"});
  const applied = reusable.applyImageStudioStyleDefinition({...layer,style:{font_size:20}},style);
  assert.equal(applied.style.font_size,64);
  assert.equal(applied.metadata.reusable_style_id,"style-1");
  const component = reusable.buildImageStudioComponentDefinition([layer],["title"],{id:"component-1",name:"Hero"});
  const instances = reusable.instantiateImageStudioComponent(component,{artboard_id:"board-2",x:100,y:200,idFactory:(()=>{let i=0;return()=>`id-${++i}`;})()});
  assert.equal(instances.length,1);
  assert.equal(instances[0].metadata.component_definition_id,"component-1");
  assert.match(instances[0].metadata.component_instance_id,/^instance-/);
});

test("Image Studio clipping mask geometry is shared by preview and deterministic export", async () => {
  const reusable = await import("../lib/creative/stills/runtime/CreativeImageStudioReusableDesignRuntime.js");
  const target={bounds:{x:100,y:100,width:200,height:200}};
  const mask={bounds:{x:150,y:125,width:100,height:150}};
  assert.deepEqual(reusable.imageStudioMaskGeometry(target,mask),{visible:true,x:50,y:25,width:100,height:150,target_width:200,target_height:200,feather:0,opacity:1,invert:false});
  assert.match(reusable.imageStudioMaskPreviewStyle(target,mask).clipPath,/inset\(/);
  const canvas=fs.readFileSync(new URL("../components/creative/specialist/ImageStudioCanvasSurface.jsx", import.meta.url),"utf8");
  const exporter=fs.readFileSync(new URL("../lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js", import.meta.url),"utf8");
  assert.match(canvas,/imageStudioMaskPreviewStyle/);
  assert.match(canvas,/is_clip_mask/);
  assert.match(exporter,/imageStudioMaskGeometry/);
  assert.match(exporter,/IMAGE_STUDIO_EXPORT_CLIP_MASK_MISSING/);
  assert.match(exporter,/blend: "dest-in"/);
});

test("Image Studio artboard metadata keeps reusable design libraries durable", async () => {
  const workspace = await import("../lib/creative/stills/runtime/CreativeImageStudioWorkspaceRuntime.js");
  const state=workspace.buildImageStudioWorkspaceState({artboards:[{id:"board",metadata:{design_styles:[{id:"style-1"}],design_components:[{id:"component-1"}]}}]});
  assert.equal(state.artboards[0].metadata.design_styles[0].id,"style-1");
  assert.equal(state.artboards[0].metadata.design_components[0].id,"component-1");
  const inspector=fs.readFileSync(new URL("../components/creative/specialist/ImageStudioLayerInspector.jsx", import.meta.url),"utf8");
  const toolbar=fs.readFileSync(new URL("../components/creative/specialist/ImageStudioCanvasToolbar.jsx", import.meta.url),"utf8");
  assert.match(inspector,/Save style/);
  assert.match(inspector,/Save component/);
  assert.match(inspector,/Insert component/);
  assert.match(toolbar,/Create clipping mask/);
  assert.match(toolbar,/Release clipping mask/);
});
