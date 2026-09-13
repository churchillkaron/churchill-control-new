import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  emptyMusicConversationState,
  mergeMusicConversationState,
  musicConversationExecutionContext,
} from "../lib/creative/music/runtime/CreativeMusicConversationStateContract.js";

test("Music project state keeps explicit current master and version", () => {
  const state = mergeMusicConversationState(emptyMusicConversationState(), {
    current_master_asset_id: "master-v4",
    current_version_id: "master-v4",
    version_lineage: [{ id: "master-v4", master_asset_id: "master-v4", parent_version_id: "master-v3" }],
  });
  assert.equal(state.current_master_asset_id, "master-v4");
  assert.equal(state.current_version_id, "master-v4");
  assert.equal(state.version_lineage[0].parent_version_id, "master-v3");
});
test("Music execution context exposes the active master without raw chat", () => {
  const context = musicConversationExecutionContext(mergeMusicConversationState(emptyMusicConversationState(), {
    current_master_asset_id: "master-v5",
    current_version_id: "master-v5",
  }));
  assert.equal(context.current_master_asset_id, "master-v5");
  assert.equal(context.current_version_id, "master-v5");
  assert.equal(context.raw_chat_transcript_saved, false);
});

const planSource = fs.readFileSync("lib/creative/music/capabilities/planWorldClassMusicStudio.js", "utf8");
const executeSource = fs.readFileSync("lib/creative/music/capabilities/executeWorldClassMusicStudio.js", "utf8");
const editSource = fs.readFileSync("lib/creative/music/runtime/CreativeMusicIntentionalEditExecutionRuntime.js", "utf8");
const settlementSource = fs.readFileSync("lib/creative/music/runtime/CreativeMusicCurrentMasterRuntime.js", "utf8");
test("Business Partner planning resolves scoped edits from current project master", () => {
  assert.match(planSource, /conversationContext\.current_master_asset_id/);
  assert.match(planSource, /looksLikeScopedMusicChange/);
  assert.match(planSource, /master_asset_id: resolvedMasterAssetId/);
});

test("intentional Music edit re-resolves current master before fingerprint verification", () => {
  assert.match(editSource, /master_asset_id \|\| conversationContext\.current_master_asset_id/);
  assert.match(editSource, /CREATIVE_MUSIC_CURRENT_MASTER_REQUIRED/);
  assert.match(editSource, /settleCurrentMusicMaster/);
});

test("current-master settlement is non-blocking and lineage preserving", () => {
  assert.match(settlementSource, /current_master_asset_id/);
  assert.match(settlementSource, /current_version_id/);
  assert.match(settlementSource, /parent_version_id/);
  assert.match(settlementSource, /persisted: false/);
});
test("user conversation patches cannot spoof active master or lineage", () => {
  assert.match(executeSource, /delete conversationStatePatch\.current_master_asset_id/);
  assert.match(executeSource, /delete conversationStatePatch\.current_version_id/);
  assert.match(executeSource, /delete conversationStatePatch\.version_lineage/);
  assert.match(executeSource, /current_master_asset_id: result\.master_asset\.id/);
});

test("confirmed scoped edit no longer requires manual master asset id", () => {
  assert.doesNotMatch(executeSource, /expected_change_set_fingerprint\) && text\(payload\.master_asset_id\)/);
  assert.match(executeSource, /if \(text\(payload\.expected_change_set_fingerprint\)\)/);
  assert.doesNotMatch(executeSource, /!text\(payload\.creative_project_id\) \|\| !text\(payload\.master_asset_id\) \|\| !text\(payload\.intended_delta \|\| payload\.objective\)/);
});
