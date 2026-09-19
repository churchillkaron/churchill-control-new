import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMusicVersionLineage,
  compareMusicVersions,
  verifyMusicVersionLineage,
} from "../lib/creative/music/runtime/CreativeMusicVersionLineageContract.js";

function asset(id, version, parent = null, operation = "GENERATE") {
  return {
    id,
    name: `Version ${version}`,
    file_url: `storage://music/${id}.wav`,
    created_at: `2026-09-${String(version).padStart(2, "0")}T00:00:00Z`,
    metadata: { media_kind: "MUSIC", music_version: version, music_asset_kind: "MASTER", music_operation: operation, parent_music_asset_id: parent },
  };
}

test("Music lineage is deterministic and self-verifying", () => {
  const assets = [asset("v1", 1), asset("v2", 2, "v1", "INTENTIONAL_SCOPED_EDIT")];
  const state = { current_master_asset_id: "v2", current_version_id: "v2", version_lineage: [{ id: "v1", master_asset_id: "v1" }, { id: "v2", master_asset_id: "v2", parent_version_id: "v1" }] };
  const lineage = buildMusicVersionLineage({ assets, state });
  assert.equal(lineage.versions.length, 2);
  assert.equal(lineage.current_master_asset_id, "v2");
  assert.equal(verifyMusicVersionLineage(lineage).valid, true);
});
test("tampered Music lineage fails verification", () => {
  const lineage = buildMusicVersionLineage({ assets: [asset("v1", 1)], state: { current_master_asset_id: "v1", current_version_id: "v1" } });
  lineage.versions[0].operation = "TAMPERED";
  assert.equal(verifyMusicVersionLineage(lineage).valid, false);
});

test("Music compare reports provenance differences without inventing audio deltas", () => {
  const lineage = buildMusicVersionLineage({ assets: [asset("v1", 1), asset("v2", 2, "v1", "VERSION_RESTORE")], state: { current_master_asset_id: "v2", current_version_id: "v2" } });
  const compared = compareMusicVersions(lineage, "v1", "v2");
  assert.equal(compared.version_delta, 1);
  assert.equal(compared.operation_changed, true);
  assert.equal(compared.audio_content_comparison_performed, false);
  assert.equal(compared.measured_audio_difference_claimed, false);
});

const runtime = fs.readFileSync("lib/creative/music/runtime/CreativeMusicVersionLineageRuntime.js", "utf8");
const inspect = fs.readFileSync("lib/creative/music/capabilities/inspectWorldClassMusicStudio.js", "utf8");
const execute = fs.readFileSync("lib/creative/music/capabilities/executeWorldClassMusicStudio.js", "utf8");

test("restore creates a new immutable Music version and never authorizes publication", () => {
  assert.match(runtime, /music_operation:\s*"VERSION_RESTORE"/);
  assert.match(runtime, /restored_from_asset_id:\s*historical\.id/);
  assert.match(runtime, /parent_music_asset_id:\s*currentMasterId/);
  assert.match(runtime, /audio_regeneration_performed:\s*false/);
  assert.match(runtime, /source_asset_overwritten:\s*false/);
  assert.match(runtime, /publish_authorized:\s*false/);
  assert.match(runtime, /music_release_manifest:\s*null/);
  assert.match(runtime, /restored_version_requires_revalidation:\s*true/);
  assert.match(runtime, /settleCurrentMusicMaster/);
});
test("Business Partner inspect and execute expose governed Music version history", () => {
  assert.match(inspect, /inspectMusicVersionLineage/);
  assert.match(inspect, /music_version_lineage:\s*versionLineage/);
  assert.match(execute, /restore_version_asset_id/);
  assert.match(execute, /restoreMusicVersionAsNew/);
  assert.match(execute, /operatorRequiresConfirmation:\s*true/);
  assert.match(execute, /publish_authorized:\s*false/);
});