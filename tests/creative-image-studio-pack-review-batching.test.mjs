import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source=fs.readFileSync("lib/creative/image/runtime/CreativeImageAssetPackConsistencyRuntime.js","utf8");

test("large Image Studio packs are split below provider media ceiling",()=>{
  assert.match(source,/function reviewBatches/);
  assert.match(source,/reviewBatches\(assets,10\)/);
  assert.match(source,/maximum_provider_media_references:10/);
  assert.match(source,/image_asset_pack_batch_count/);
  assert.match(source,/image_asset_pack_batch_hash/);
});

test("batching keeps world anchors and identity-matching character sheets",()=>{
  assert.match(source,/ENVIRONMENT_LOOKFRAME/);
  assert.match(source,/THREAT_DESIGN/);
  assert.match(source,/characterByIdentity/);
  assert.match(source,/identityKey\(candidate\)/);
});

test("multi-batch pack release waits for every batch and seals the whole pack atomically",()=>{
  assert.match(source,/groupTasks\.length<expected/);
  assert.match(source,/groupTasks\.some\(task=>\["WAITING","RUNNING"\]/);
  assert.match(source,/image_asset_pack_all_asset_node_ids/);
  assert.match(source,/IMAGE_ASSET_PACK_BATCH_CONSISTENCY_FAILED/);
  assert.match(source,/batch_hashes:/);
  assert.match(source,/image_asset_pack_review_task_ids/);
});
