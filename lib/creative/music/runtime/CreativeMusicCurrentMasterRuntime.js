import {
  updateMusicConversationState,
} from "./CreativeMusicConversationStateRuntime.js";

const CONTRACT = "AVANTIQO_MUSIC_CURRENT_MASTER_SETTLEMENT_V1";
function text(value) { return String(value ?? "").trim(); }

export async function settleCurrentMusicMaster({
  organization_id,
  creative_project_id,
  master_asset_id,
  parent_master_asset_id = null,
  summary = null,
} = {}) {
  if (!text(organization_id) || !text(creative_project_id) || !text(master_asset_id)) {
    return { contract: CONTRACT, attempted: false, persisted: false, state: null, error: null };
  }
  try {
    const state = await updateMusicConversationState({
      organization_id,
      creative_project_id,
      patch: {
        current_master_asset_id: text(master_asset_id),
        current_version_id: text(master_asset_id),
        version_lineage: [{
          id: text(master_asset_id),
          master_asset_id: text(master_asset_id),
          parent_version_id: text(parent_master_asset_id) || null,
          summary: text(summary) || null,
        }],
      },
      decision_summary: text(summary) || null,
    });
    return { contract: CONTRACT, attempted: true, persisted: true, state, error: null };
  } catch (error) {
    return {
      contract: CONTRACT,
      attempted: true,
      persisted: false,
      state: null,
      error: text(error?.message || error) || "MUSIC_CURRENT_MASTER_PERSISTENCE_FAILED",
    };
  }
}

export const CreativeMusicCurrentMasterRuntime = Object.freeze({
  contract: CONTRACT,
  settle: settleCurrentMusicMaster,
});
