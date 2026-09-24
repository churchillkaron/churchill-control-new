import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const dispatch=fs.readFileSync("lib/creative/video/runtime/CreativeVideoProductionDispatchBootstrap.js","utf8");
const provider=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js","utf8");
const local=fs.readFileSync("lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoLocalQueueProvider.js","utf8");

test("Studio canonicalizes shot identity and Shot Bible before Service Runtime dispatch",()=>{
  assert.match(dispatch,/shot_id:\s*shotId/);
  assert.match(dispatch,/shot_bible:\s*shotBible/);
  assert.match(dispatch,/CreativeShotBibleRuntime\.assert/);
  assert.match(dispatch,/video_provider_selection_owner:\s*"SERVICE_RUNTIME"/);
});

test("Video V2 reconstructs trusted Studio lineage instead of trusting caller metadata",()=>{
  assert.match(provider,/AVANTIQO_VIDEO_STUDIO_LINEAGE_V1/);
  assert.match(provider,/CREATIVE_SHOT_BIBLE_V1/);
  assert.match(provider,/function studioLineage\(input = \{\}\)/);
  assert.match(provider,/AVANTIQO_VIDEO_STUDIO_SHOT_ID_MISMATCH/);
  assert.match(provider,/studio_lineage:\s*_untrustedStudioLineage/);
  assert.match(provider,/studio_lineage:\s*lineage/);
  assert.match(provider,/AvantiqoVideoLocalQueueProvider\.execute\(advancedInput\(input\)\)/);
});

test("local Video queue serializes governed Studio lineage into the Node01 payload",()=>{
  assert.match(local,/generation_envelope: object\(input\.generation_envelope\)/);
  assert.match(local,/shot_bible: object\(input\.shot_bible\)/);
  assert.match(local,/shot_id: text\(input\.shot_id \|\| input\.shot_bible\?\.shot_id\)/);
  assert.match(local,/runtime_contract: "AVANTIQO_NODE01_LTX25_GGUF_LOCAL_V1"/);
});

test("local queued result is bound to the exact provider job and organization output target",()=>{
  assert.match(local,/JOB_PREFIX = "local-video-ltx25:"/);
  assert.match(local,/organization_id: organizationId/);
  assert.match(local,/usage_id: usageId/);
  assert.match(local,/storage_reference: storageUpload\.storage_reference/);
  assert.match(local,/provider_job_id: JOB_PREFIX \+ inserted\.data\.id/);
});
