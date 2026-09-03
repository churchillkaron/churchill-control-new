import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const dispatch = fs.readFileSync(
  "lib/creative/video/runtime/CreativeVideoProductionDispatchBootstrap.js",
  "utf8",
);
const provider = fs.readFileSync(
  "lib/platform/service-runtime/providers/avantiqo-video/AvantiqoVideoProviderV2.js",
  "utf8",
);
const modalWorker = fs.readFileSync(
  "lib/platform/service-runtime/providers/avantiqo-owned/AvantiqoOwnedModalWorker.js",
  "utf8",
);
const nativeAdapter = fs.readFileSync(
  "services/avantiqo-video-engine/modal_native_job.py",
  "utf8",
);

test("Studio canonicalizes shot identity and Shot Bible before Service Runtime dispatch", () => {
  assert.match(dispatch, /shot_id:\s*shotId/);
  assert.match(dispatch, /shot_bible:\s*shotBible/);
  assert.match(dispatch, /CreativeShotBibleRuntime\.assert/);
  assert.match(dispatch, /video_provider_selection_owner:\s*"SERVICE_RUNTIME"/);
});

test("Video V2 reconstructs trusted Studio lineage instead of trusting caller metadata", () => {
  assert.match(provider, /AVANTIQO_VIDEO_STUDIO_LINEAGE_V1/);
  assert.match(provider, /CREATIVE_SHOT_BIBLE_V1/);
  assert.match(provider, /function studioLineage\(input = \{\}\)/);
  assert.match(provider, /AVANTIQO_VIDEO_STUDIO_SHOT_ID_MISMATCH/);
  assert.match(provider, /studio_lineage:\s*_untrustedStudioLineage/);
  assert.match(provider, /studio_lineage:\s*lineage/);
  assert.match(provider, /modalVideoWorker\.execute\(advancedInput\(input\)\)/);
});

test("shared owned Modal worker serializes trusted lineage into the governed payload", () => {
  assert.match(modalWorker, /structured_specification:\s*cleanOutput\(\{/);
  assert.match(modalWorker, /metadata:\s*input\.metadata/);
  assert.match(modalWorker, /const call = await worker\.spawn\(\[payload\]\)/);
  assert.match(modalWorker, /provider_job_id:\s*`\$\{jobPrefix\}\$\{rawJobId\}`/);
});

test("native Video Modal adapter validates Studio lineage before paid generation", () => {
  assert.match(nativeAdapter, /STUDIO_LINEAGE_CONTRACT = "AVANTIQO_VIDEO_STUDIO_LINEAGE_V1"/);
  assert.match(nativeAdapter, /SHOT_BIBLE_CONTRACT = "CREATIVE_SHOT_BIBLE_V1"/);
  assert.match(nativeAdapter, /def _studio_lineage\(data:/);
  assert.match(nativeAdapter, /specification = _object\(data\.get\("structured_specification"\)\)/);
  assert.match(nativeAdapter, /metadata = _object\(specification\.get\("metadata"\)\)/);
  assert.match(nativeAdapter, /lineage = _object\(metadata\.get\("studio_lineage"\)\)/);
  assert.match(nativeAdapter, /AVANTIQO_VIDEO_LTX25_MODAL_SHOT_ID_MISMATCH/);
  assert.match(nativeAdapter, /AVANTIQO_VIDEO_LTX25_MODAL_SHOT_BIBLE_ORGANIZATION_MISMATCH/);

  const validationIndex = nativeAdapter.indexOf("studio_lineage = _studio_lineage(data)");
  const paidGenerationIndex = nativeAdapter.indexOf("generation = generate_native_master.remote(");
  assert.ok(validationIndex >= 0, "Studio lineage validation must exist");
  assert.ok(paidGenerationIndex >= 0, "native generation call must exist");
  assert.ok(
    validationIndex < paidGenerationIndex,
    "Studio lineage must be validated before the paid B200 generation call",
  );
});

test("completed native result returns compact verified lineage evidence", () => {
  assert.match(nativeAdapter, /"studio_lineage_contract": job\["studio_lineage"\]\["contract"\]/);
  assert.match(nativeAdapter, /"shot_id": job\["studio_lineage"\]\["shot_id"\]/);
  assert.match(nativeAdapter, /"shot_bible_contract": job\["studio_lineage"\]\["shot_bible_contract"\]/);
  assert.match(nativeAdapter, /"studio_lineage_validated": True/);
});
