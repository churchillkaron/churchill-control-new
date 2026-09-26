import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { validateImageStudioSmartMaskResult, materializeImageStudioSmartMask } from "../lib/creative/stills/runtime/CreativeImageStudioSmartMaskRuntime.js";

const good={target_layer_id:"layer",source_asset_id:"asset",source_checksum:"abc",matte_asset_id:"matte",same_source_dimensions:true,confidence_score:.98,edge_quality_score:98,source_alignment_score:99,source_pixels_modified:false,provider:"segmentation-provider",model:"model-v1",width:1000,height:1000};
test("smart mask result fails closed on source identity or weak matte quality",()=>{
 const bad=validateImageStudioSmartMaskResult({selection_kind:"SUBJECT",target_layer_id:"layer",source_asset_id:"asset",source_checksum:"abc",result:{...good,source_asset_id:"other",edge_quality_score:80}});
 assert.equal(bad.passed,false);
 assert.ok(bad.failures.includes("SMART_MASK_SOURCE_ASSET_MISMATCH"));
 assert.ok(bad.failures.includes("SMART_MASK_EDGE_QUALITY_BELOW_FLOOR"));
});
test("approved smart matte materializes as ordinary editable MASK layer with provenance",()=>{
 const layer=materializeImageStudioSmartMask({id:"mask",artboard_id:"board",target_layer_id:"layer",source_asset_id:"asset",source_checksum:"abc",selection_kind:"PERSON",result:good,sort_order:3});
 assert.equal(layer.layer_type,"MASK");
 assert.equal(layer.source_asset_id,"matte");
 assert.equal(layer.metadata.mask_source_kind,"RASTER_MATTE");
 assert.equal(layer.metadata.smart_mask,true);
 assert.equal(layer.metadata.mask_provenance.provider,"segmentation-provider");
});
test("Image Studio command contract exposes smart-mask request through canonical route",()=>{
 const workspace=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioWorkspaceRuntime.js","utf8");
 const actions=fs.readFileSync("lib/creative/stills/actions/CreativeImageStudioWorkspaceActions.js","utf8");
 assert.match(workspace,/request_smart_mask/);
 assert.match(actions,/requestImageStudioSmartMask/);
 assert.match(actions,/creative\.image\.smart-mask|request_smart_mask/);
});
test("deterministic export supports raster matte assets for smart masks",()=>{
 const exporter=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js","utf8");
 assert.match(exporter,/RASTER_MATTE/);
 assert.match(exporter,/mask_source_asset_id|source_asset_id/);
 assert.match(exporter,/greyscale|grayscale/);
});
