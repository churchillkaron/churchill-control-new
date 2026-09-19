import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildMusicMasterLineageMetadata,
  buildMusicSourceGenerationMetadata,
  evaluateMusicMasterSet,
  musicMasterSetId,
  musicSourceGenerationId,
} from "../lib/creative/music/runtime/CreativeMusicMasterSetLineageRuntime.js";
import { buildMusicReleaseManifest } from "../lib/creative/music/runtime/CreativeMusicReleaseManifestRuntime.js";

function source(id = "source-2", version = 2) {
  return { id, metadata: { media_kind: "MUSIC", music_asset_kind: "SOURCE", music_version: version, music_operation: "AUTOMATIC_TECHNICAL_REPAIR", parent_music_asset_id: "source-1", owned_engine: true } };
}

function variant(sourceAsset, id, variantId) {
  const metadata = { ...buildMusicMasterLineageMetadata({ sourceAsset, variantId }), deliveries: [{ url: `https://example.test/${id}.wav`, mime_type: "audio/wav", checksum: id }] };
  return { variant: { id: variantId, destinations: [variantId] }, destination_qc: { passed: true }, perceptual_translation: { contract: "AVANTIQO_MUSIC_PERCEPTUAL_TRANSLATION_V1", passed: true }, finishing: { master_asset: { id, file_url: metadata.deliveries[0].url, metadata } } };
}
test("one exact source generation yields one current master set", () => {
  const src = source();
  const rows = [variant(src, "master-stream", "streaming"), variant(src, "master-club", "club")];
  const result = evaluateMusicMasterSet({ sourceAsset: src, masterVariants: rows });
  assert.equal(result.lineage_current, true);
  assert.equal(result.mixed_generation, false);
  assert.equal(result.release_ready, true);
  assert.equal(result.expected_generation_id, musicSourceGenerationId(src));
  assert.equal(result.expected_master_set_id, musicMasterSetId(src));
});

test("mixed or stale destination master fails closed", () => {
  const src = source();
  const old = source("source-1", 1);
  const rows = [variant(src, "master-stream", "streaming"), variant(old, "master-club-old", "club")];
  const result = evaluateMusicMasterSet({ sourceAsset: src, masterVariants: rows });
  assert.equal(result.lineage_current, false);
  assert.equal(result.mixed_generation, true);
  assert.equal(result.release_ready, false);
  assert.ok(result.blockers.includes("MASTER_SET_STALE_OR_MIXED_GENERATION"));
});
test("release-ready manifest rejects mixed master generations", () => {
  const src = source();
  const old = source("source-1", 1);
  const rows = [variant(src, "master-stream", "streaming"), variant(old, "master-club-old", "club")];
  const finishing = {
    mastering_plan: { contract: "AVANTIQO_MUSIC_MASTERING_DESTINATION_V1", requested: ["streaming", "club"], separate_masters_required: true },
    destination_qc_passed: true,
    perceptual_translation_passed: true,
    master_variants: rows,
    master_set_lineage: evaluateMusicMasterSet({ sourceAsset: src, masterVariants: rows }),
  };
  assert.throws(() => buildMusicReleaseManifest({ organization_id: "org-1", creative_project_id: "project-1", source_asset: src, finishing, dailies: { report: { passed: true } }, tribunal: { release_ready: true }, release_ready: true }), /MASTER_SET_STALE_OR_MIXED/);
});

test("finishing and repair paths bind caches to exact source generation", () => {
  const finishing = fs.readFileSync("lib/creative/music/runtime/CreativeMusicFinishingRuntime.js", "utf8");
  const automatic = fs.readFileSync("lib/creative/music/runtime/CreativeMusicAutomaticRepairRuntime.js", "utf8");
  const worldClass = fs.readFileSync("lib/creative/music/runtime/CreativeMusicWorldClassExecutionRuntime.js", "utf8");
  assert.match(finishing, /music_generation_id/);
  assert.match(finishing, /music_master_set_id/);
  assert.match(finishing, /master_set_lineage_current/);
  assert.match(automatic, /AUTOMATIC_TECHNICAL_REPAIR/);
  assert.match(automatic, /ensureMasters/);
  assert.match(worldClass, /finalSourceAsset/);
  assert.match(worldClass, /MASTER_SET_LINEAGE_REQUIRED/);
});
