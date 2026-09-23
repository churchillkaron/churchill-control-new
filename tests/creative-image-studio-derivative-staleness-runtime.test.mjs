import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  selectImageAssetBundle,
} from "../lib/creative/image/runtime/CreativeImageAssetBundleHandoffRuntime.js";

function parentVersion(parent){
  return crypto.createHash("sha256").update(JSON.stringify({
    id:parent.id||null,
    checksum:parent.technical?.checksum||null,
    selection_seal:parent.metadata?.image_asset_exploration_selection_seal_hash||null,
    localized_repair_review_task_id:parent.metadata?.localized_repair_review_task_id||null,
    image_asset_review_task_id:parent.metadata?.image_asset_review_task_id||null,
    perceptual_qc_sealed:parent.metadata?.image_asset_perceptual_qc_sealed===true,
  })).digest("hex");
}

function derivative(parent,type,version){
  return {
    id:"derivative-"+type,
    url:"storage://derivative/"+type,
    status:"APPROVED",
    review:{approved:true},
    metadata:{
      parent_image_asset_node_id:parent.id,
      continuity_group_id:"scene-1",
      derivative_type:type,
      image_asset_derivative_qc_sealed:true,
      release_approved:true,
      parent_version_fingerprint:version,
    },
  };
}

test("derivative handoff accepts only derivatives built from current parent version",()=>{
  const parent={
    id:"hero-1",
    technical:{checksum:"hero-v1"},
    metadata:{
      image_asset_perceptual_qc_sealed:true,
      image_asset_exploration_selection_seal_hash:"selection-v1",
    },
  };
  const version=parentVersion(parent);
  const bundle=selectImageAssetBundle({
    asset_nodes:[
      parent,
      derivative(parent,"SUBJECT_SEGMENTATION",version),
      derivative(parent,"ALPHA_MATTE",version),
      derivative(parent,"DEPTH_MAP",version),
      derivative(parent,"UPSCALED_MASTER",version),
    ],
    parent_asset_node_id:parent.id,
    continuity_group_id:"scene-1",
  });
  assert.equal(bundle.ready_for_video,true);
  assert.equal(bundle.ready_for_vfx,true);
  assert.equal(bundle.stale_derivative_count,0);
});

test("derivative handoff rejects previously approved technical derivatives after parent pixels change",()=>{
  const parentV1={
    id:"hero-2",
    technical:{checksum:"hero-v1"},
    metadata:{
      image_asset_perceptual_qc_sealed:true,
      image_asset_exploration_selection_seal_hash:"selection-v1",
    },
  };
  const oldVersion=parentVersion(parentV1);
  const parentV2={...parentV1,technical:{checksum:"hero-v2"}};
  const oldDerivatives=[
    derivative(parentV1,"SUBJECT_SEGMENTATION",oldVersion),
    derivative(parentV1,"ALPHA_MATTE",oldVersion),
    derivative(parentV1,"DEPTH_MAP",oldVersion),
    derivative(parentV1,"UPSCALED_MASTER",oldVersion),
  ];
  const bundle=selectImageAssetBundle({
    asset_nodes:[parentV2,...oldDerivatives],
    parent_asset_node_id:parentV2.id,
    continuity_group_id:"scene-1",
  });
  assert.equal(bundle.ready_for_video,false);
  assert.equal(bundle.ready_for_vfx,false);
  assert.equal(bundle.ready_for_compositing,false);
  assert.equal(bundle.stale_derivative_count,4);
});
