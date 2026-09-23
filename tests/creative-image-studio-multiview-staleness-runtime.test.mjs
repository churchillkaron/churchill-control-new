import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import {
  selectImageAssetMultiViewPack,
} from "../lib/creative/image/runtime/CreativeImageAssetMultiViewHandoffRuntime.js";

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

function view(parent,id,version){
  return {
    id:"view-"+id,
    url:"storage://view/"+id,
    status:"APPROVED",
    review:{approved:true},
    metadata:{
      parent_image_asset_node_id:parent.id,
      continuity_group_id:"scene-1",
      image_multiview_view_id:id,
      image_multiview_qc_sealed:true,
      release_approved:true,
      image_multiview_qc_seal_hash:"qc-pack",
      parent_version_fingerprint:version,
    },
  };
}

test("multiview handoff accepts only views built from the current parent version",()=>{
  const parent={
    id:"character-1",
    technical:{checksum:"pixels-v1"},
    metadata:{
      image_asset_perceptual_qc_sealed:true,
      image_asset_exploration_selection_seal_hash:"selection-v1",
    },
  };
  const version=parentVersion(parent);
  const ids=["FRONT","LEFT_THREE_QUARTER","RIGHT_PROFILE","REAR","DETAIL"];
  const result=selectImageAssetMultiViewPack({
    asset_nodes:[parent,...ids.map(id=>view(parent,id,version))],
    parent_asset_node_id:parent.id,
    continuity_group_id:"scene-1",
  });
  assert.equal(result.complete,true);
  assert.equal(result.stale_view_count,0);
  assert.equal(result.parent_version_fingerprint,version);
});

test("multiview handoff rejects a previously approved pack after parent pixels change",()=>{
  const parentV1={
    id:"threat-1",
    technical:{checksum:"pixels-v1"},
    metadata:{
      image_asset_perceptual_qc_sealed:true,
      image_asset_exploration_selection_seal_hash:"selection-v1",
    },
  };
  const oldVersion=parentVersion(parentV1);
  const parentV2={
    ...parentV1,
    technical:{checksum:"pixels-v2"},
  };
  const ids=["FRONT","LEFT_THREE_QUARTER","RIGHT_PROFILE","REAR","DETAIL"];
  const result=selectImageAssetMultiViewPack({
    asset_nodes:[parentV2,...ids.map(id=>view(parentV1,id,oldVersion))],
    parent_asset_node_id:parentV2.id,
    continuity_group_id:"scene-1",
  });
  assert.equal(result.complete,false);
  assert.equal(result.view_count,0);
  assert.equal(result.stale_view_count,5);
  assert.equal(result.stale_view_asset_node_ids.length,5);
});
