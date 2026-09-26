import test from "node:test";
import assert from "node:assert/strict";
import { assessImageStudioComposition } from "../lib/creative/stills/runtime/CreativeImageStudioQualityPreflightRuntime.js";

const printBoard={width:1200,height:1200,export_preset:{id:"poster_print"}};

function image(metadata={}){
  return {id:"hero",layer_type:"IMAGE",visible:true,source_asset_id:"asset-1",bounds:{x:0,y:0,width:1200,height:1200},metadata:{target_dpi:300,...metadata}};
}

test("print preflight reduces effective PPI by crop zoom",()=>{
  const result=assessImageStudioComposition({
    artboard:printBoard,
    layers:[image({source_dimensions:{width:2400,height:2400},crop:{zoom:3}})],
  });
  const finding=result.findings.warnings.find(item=>item.code==="PRINT_IMAGE_RESOLUTION_LOW");
  assert.ok(finding);
  assert.equal(finding.detail.effective_ppi,200);
});

test("heavy crop zoom can turn an apparently high-resolution source into a critical blocker",()=>{
  const result=assessImageStudioComposition({
    artboard:printBoard,
    layers:[image({source_dimensions:{width:2400,height:2400},crop:{zoom:6}})],
  });
  const finding=result.findings.blockers.find(item=>item.code==="PRINT_IMAGE_RESOLUTION_CRITICAL");
  assert.ok(finding);
  assert.equal(finding.detail.effective_ppi,100);
  assert.equal(result.release_ready,false);
});

test("raster print image with unknown source dimensions fails closed",()=>{
  const result=assessImageStudioComposition({artboard:printBoard,layers:[image()]});
  assert.ok(result.blockers.includes("PRINT_IMAGE_RESOLUTION_UNKNOWN:hero"));
  assert.equal(result.release_ready,false);
});

test("explicit vector print asset is not blocked for missing raster pixel dimensions",()=>{
  const result=assessImageStudioComposition({
    artboard:printBoard,
    layers:[image({is_vector:true,mime_type:"image/svg+xml"})],
  });
  assert.equal(result.blockers.some(item=>item.startsWith("PRINT_IMAGE_RESOLUTION_UNKNOWN")),false);
});
