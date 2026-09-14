import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  buildMusicReleaseManifest,
  musicReleasePackageSummary,
  verifyMusicReleaseManifest,
} from "../lib/creative/music/runtime/CreativeMusicReleaseManifestRuntime.js";
import { musicSourceGenerationId, musicMasterSetId } from "../lib/creative/music/runtime/CreativeMusicMasterSetLineageRuntime.js";

function fixture() {
  const sourceAsset = { id: "source-1", metadata: { music_version: 4, music_usage_id: "usage-1", generation_seed: 42, music_preproduction_hash: "pre-hash", music_direction_hash: "dir-hash", owned_engine: true } };
  const generationId = musicSourceGenerationId(sourceAsset);
  const masterSetId = musicMasterSetId(sourceAsset);
  return buildMusicReleaseManifest({
    organization_id: "org-1",
    creative_project_id: "project-1",
    source_asset: sourceAsset,
    finishing: {
      mastering_plan: {
        contract: "AVANTIQO_MUSIC_MASTERING_DESTINATION_V1",
        requested: ["streaming"],
        separate_masters_required: false,
      },
      destination_qc_passed: true,
      perceptual_translation_passed: true,
      master_variants: [{
        variant: { id: "master-1-streaming", destinations: ["streaming"] },
        destination_qc: { passed: true },
        perceptual_translation: { contract: "AVANTIQO_MUSIC_PERCEPTUAL_TRANSLATION_V1", passed: true },
        finishing: {
          master_asset: {
            id: "master-asset-1",
            file_url: "storage://creative-assets/master.wav",
            metadata: {
              source_asset_id: sourceAsset.id,
              music_generation_id: generationId,
              music_master_set_id: masterSetId,
              music_master_set_current: true,
              mastering_variant_id: "master-1-streaming",
              mastering_destinations: ["streaming"],
              master_id: "master-hash",
              integrated_lufs: -14,
              true_peak_dbtp: -1,
              deliveries: [{
                delivery_id: "streaming-wav",
                name: "master.wav",
                url: "storage://creative-assets/master.wav",
                mime_type: "audio/wav",
                checksum: "audio-checksum",
                storage_path: "org/project/audio/master.wav",
                probe: { codec_name: "pcm_s24le", sample_rate: 48000, channels: 2 },
              }],
            },
          },
        },
      }],
    },
    dailies: { report: { passed: true } },
    tribunal: { release_ready: true },
    release_ready: true,
  });
}
test("Music release manifest is self-verifying and binds exact delivery provenance", () => {
  const manifest = fixture();
  assert.equal(verifyMusicReleaseManifest(manifest), true);
  assert.equal(manifest.source.asset_id, "source-1");
  assert.equal(manifest.masters[0].master_asset_id, "master-asset-1");
  assert.equal(manifest.masters[0].deliveries[0].checksum, "audio-checksum");
  assert.equal(manifest.governance.publication_authorized, false);
});

test("tampered release manifest fails verification", () => {
  const manifest = fixture();
  const tampered = structuredClone(manifest);
  tampered.masters[0].deliveries[0].checksum = "tampered";
  assert.equal(verifyMusicReleaseManifest(tampered), false);
});

test("release package summary exposes verified destinations without authorizing publication", () => {
  const summary = musicReleasePackageSummary(fixture());
  assert.equal(summary.verified, true);
  assert.equal(summary.release_ready, true);
  assert.equal(summary.master_count, 1);
  assert.equal(summary.delivery_count, 1);
  assert.deepEqual(summary.destinations, ["streaming"]);
  assert.equal(summary.publication_authorized, false);
});

const finishing = fs.readFileSync("lib/creative/music/runtime/CreativeMusicFinishingRuntime.js", "utf8");
const execution = fs.readFileSync("lib/creative/music/runtime/CreativeMusicWorldClassExecutionRuntime.js", "utf8");

test("release manifest is durably settled on source and master assets", () => {
  assert.match(finishing, /persistMusicReleaseManifest/);
  assert.match(finishing, /music_release_manifest_fingerprint/);
  assert.match(finishing, /checksum: file\?\.checksum/);
  assert.match(execution, /music_release_manifest: releaseManifest/);
  assert.match(execution, /music_release_package: releasePackage/);
  assert.match(execution, /persistReleaseManifest/);
});
