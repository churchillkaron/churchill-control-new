import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const imageGraph=fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetGraphRuntime.js","utf8");
const visualGraph=fs.readFileSync("lib/creative/production-graph/runtime/CreativeVisualProductionGraphRuntime.js","utf8");
const motionGate=fs.readFileSync("lib/creative/production-graph/runtime/CreativeVisualProductionExecutionGate.js","utf8");

test("non-human visual derived frame is reused as Image Studio hero candidate A",()=>{
  assert.match(imageGraph,/assetClass==="HERO_FRAME"/);
  assert.match(imageGraph,/variant\.id==="A"/);
  assert.match(imageGraph,/visual-derived-frame/);
  assert.match(imageGraph,/bindExistingVisualDerivedAsHero/);
  assert.match(imageGraph,/visual_derived_frame_reused_as_image_studio_hero:true/);
  assert.match(imageGraph,/reused_visual_derived_frame:true/);
});

test("reused hero preserves visual-route controls and gains Image Studio authority",()=>{
  assert.match(imageGraph,/\.\.\.object\(node\.generation\)/);
  assert.match(imageGraph,/image_asset_authority:d\.authority/);
  assert.match(imageGraph,/image_camera_authority:imageCameraAuthority/);
  assert.match(imageGraph,/identity_atlas_asset_node_id/);
  assert.match(imageGraph,/world_consistency_contract/);
  assert.match(imageGraph,/reference_asset_ids:list\(shot\.reference_asset_ids\)/);
});

test("visual-derived frame remains the signature-frame execution node",()=>{
  assert.match(visualGraph,/type: "VISUAL_DERIVED_FRAME"/);
  assert.match(visualGraph,/signature_frame_review_required: true/);
  assert.match(visualGraph,/reject_before_motion_generation: true/);
});

test("Image Studio authority now covers every governed video generation capability",()=>{
  assert.match(motionGate,/"ai\.video\.generate"/);
  assert.match(motionGate,/"ai\.video\.image_to_video"/);
  assert.match(motionGate,/"ai\.video\.first_last_frame_to_video"/);
  assert.doesNotMatch(
    motionGate.slice(
      motionGate.indexOf("function imageStudioAuthorityRequired"),
      motionGate.indexOf("function humanSubjectExpected"),
    ),
    /SHARED_KEYFRAME_SEQUENCE|MULTIPASS_COMPLEX/,
  );
});
