import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("owned Subject and Background masks execute through the existing segmentation capability",()=>{
  const runtime=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioOwnedSemanticMaskRuntime.js","utf8");
  const derivative=fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetDerivativeExecutionRuntime.js","utf8");
  const actions=fs.readFileSync("lib/creative/stills/actions/CreativeImageStudioWorkspaceActions.js","utf8");
  const workspace=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioWorkspaceRuntime.js","utf8");
  assert.match(runtime,/CreativeImageAssetDerivativeExecutionRuntime\.executeSegmentation/);
  assert.match(runtime,/creative\.image\.segmentation\.execute/);
  assert.match(runtime,/storage:\/\//);
  assert.match(derivative,/bbox=null/);
  assert.match(actions,/execute_semantic_mask/);
  assert.match(workspace,/execute_semantic_mask/);
});

test("owned semantic mask result carries durable matte evidence and mandatory review",()=>{
  const runtime=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioOwnedSemanticMaskRuntime.js","utf8");
  const semantic=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioSemanticMaskRuntime.js","utf8");
  assert.match(runtime,/mask_storage_reference/);
  assert.match(runtime,/mask_preview_url/);
  assert.match(runtime,/review_required:true/);
  assert.match(semantic,/semantic_matte_storage_reference/);
  assert.match(semantic,/semantic_review_required/);
  assert.match(semantic,/semantic_review_approved/);
});

test("editor executes owned semantic masks, previews the real matte and requires explicit approval",()=>{
  const inspector=fs.readFileSync("components/creative/specialist/ImageStudioLayerInspector.jsx","utf8");
  const store=fs.readFileSync("components/creative/specialist/useImageStudioWorkspaceStore.js","utf8");
  const workspace=fs.readFileSync("components/creative/specialist/ImageStudioWorkspace.jsx","utf8");
  assert.match(inspector,/requestOwnedSemanticMask/);
  assert.match(inspector,/execute_semantic_mask/);
  assert.match(inspector,/OpenCV GrabCut/);
  assert.match(inspector,/semantic_matte_preview_url/);
  assert.match(inspector,/Approve semantic matte after visual review/);
  assert.match(store,/approveSelectedSemanticMask/);
  assert.match(store,/attachImageStudioSemanticMatte/);
  assert.match(workspace,/persistence=\{persistence\} assets=\{images\}/);
});

test("master export signs semantic matte storage and fails closed until review approval",()=>{
  const exporter=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js","utf8");
  assert.match(exporter,/signCreativeStorageReference/);
  assert.match(exporter,/semantic_matte_storage_reference/);
  assert.match(exporter,/IMAGE_STUDIO_EXPORT_SEMANTIC_MASK_REVIEW_REQUIRED/);
  assert.match(exporter,/semantic_contract: "CREATIVE_IMAGE_STUDIO_SEMANTIC_MASK_V2"/);
});

test("semantic execution does not claim unsupported Hair Sky Person or Product classes",()=>{
  const runtime=fs.readFileSync("lib/creative/stills/runtime/CreativeImageStudioOwnedSemanticMaskRuntime.js","utf8");
  assert.match(runtime,/\["SUBJECT","BACKGROUND"\]/);
  assert.doesNotMatch(runtime,/HAIR|SKY|PERSON|PRODUCT/);
});
