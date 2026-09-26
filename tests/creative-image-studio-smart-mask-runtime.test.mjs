import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { validateImageStudioSmartMaskResult, materializeImageStudioSmartMask, IMAGE_STUDIO_SMART_MASK_KINDS } from "../lib/creative/stills/runtime/CreativeImageStudioSmartMaskRuntime.js";

const good={
  target_layer_id:"layer",source_asset_id:"asset",source_checksum:"abc",
  matte_asset_id:"matte",matte_storage_reference:"storage://creative/matte.png",matte_checksum:"matte-sha",
  same_source_dimensions:true,source_pixels_modified:false,provider:"opencv",model:"grabcut-7-iter",
  width:1000,height:1000,derivative_type:"ALPHA_MATTE",derivative_contract:"CREATIVE_IMAGE_ASSET_DERIVATIVE_ARTIFACT_V1",
};

test("smart mask v2 exposes only capabilities the owned GrabCut engine actually supports",()=>{
  assert.deepEqual(IMAGE_STUDIO_SMART_MASK_KINDS,["SUBJECT","FOREGROUND","BACKGROUND"]);
});

test("smart mask result fails closed on source identity or ungoverned matte evidence",()=>{
  const bad=validateImageStudioSmartMaskResult({
    selection_kind:"SUBJECT",target_layer_id:"layer",source_asset_id:"asset",source_checksum:"abc",
    result:{...good,source_asset_id:"other",matte_storage_reference:"https://example.com/matte.png"},
  });
  assert.equal(bad.passed,false);
  assert.ok(bad.failures.includes("SMART_MASK_SOURCE_ASSET_MISMATCH"));
  assert.ok(bad.failures.includes("SMART_MASK_GOVERNED_MATTE_REQUIRED"));
});

test("owned smart matte materializes as editable review-required MASK layer with provenance",()=>{
  const layer=materializeImageStudioSmartMask({
    id:"mask",artboard_id:"board",target_layer_id:"layer",source_asset_id:"asset",source_checksum:"abc",
    selection_kind:"FOREGROUND",result:good,target_bounds:{x:10,y:20,width:500,height:400},sort_order:3,
  });
  assert.equal(layer.layer_type,"MASK");
  assert.equal(layer.source_asset_id,"matte");
  assert.equal(layer.metadata.mask_source_kind,"RASTER_MATTE");
  assert.equal(layer.metadata.smart_mask,true);
  assert.equal(layer.metadata.smart_mask_review_required,true);
  assert.equal(layer.metadata.smart_mask_review_approved,false);
  assert.equal(layer.metadata.smart_mask_status,"REVIEW_REQUIRED");
  assert.equal(layer.metadata.mask_provenance.provider,"opencv");
  assert.equal(layer.metadata.mask_provenance.matte_storage_reference,"storage://creative/matte.png");
});

test("Image Studio smart mask command executes the owned segmentation runtime directly",()=>{
  const workspace=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioWorkspaceRuntime.js","utf8");
  const actions=fs.readFileSync("lib/creative/stills/actions/CreativeImageStudioWorkspaceActions.js","utf8");
  const smart=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioSmartMaskRuntime.js","utf8");
  const derivative=fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetDerivativeExecutionRuntime.js","utf8");
  assert.match(workspace,/request_smart_mask/);
  assert.doesNotMatch(workspace,/materialize_smart_mask/);
  assert.match(actions,/requestImageStudioSmartMask/);
  assert.match(smart,/CreativeImageAssetDerivativeExecutionRuntime\.executeSegmentation/);
  assert.match(derivative,/creative\.image\.segmentation\.execute/);
});

test("deterministic export signs governed raster matte references, preserves source geometry and blocks unreviewed smart masks",()=>{
  const exporter=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js","utf8");
  assert.match(exporter,/RASTER_MATTE/);
  assert.match(exporter,/buildImageStudioRasterMaskBuffer/);
  assert.match(exporter,/signCreativeStorageReference/);
  assert.match(exporter,/matte_storage_reference/);
  assert.match(exporter,/source_geometry_locked: true/);
  assert.match(exporter,/IMAGE_STUDIO_EXPORT_SMART_MASK_REVIEW_REQUIRED/);
  assert.match(exporter,/IMAGE_STUDIO_EXPORT_SMART_MASK_STORAGE_REFERENCE_REQUIRED/);
});

test("Image Studio exposes honest smart selection controls and explicit visual approval",()=>{
  const inspector=fs.readFileSync("components/creative/specialist/ImageStudioLayerInspector.jsx","utf8");
  const store=fs.readFileSync("components/creative/specialist/useImageStudioWorkspaceStore.js","utf8");
  assert.match(inspector,/Smart selection/);
  assert.match(inspector,/>Subject</);
  assert.match(inspector,/>Foreground</);
  assert.match(inspector,/>Background</);
  assert.match(inspector,/Semantic Hair \/ Sky \/ Person \/ Product classes are not claimed/);
  assert.match(inspector,/Approve smart mask after visual review/);
  assert.match(store,/attachSmartMaskLayer/);
  assert.match(store,/approveSelectedSmartMask/);
});
