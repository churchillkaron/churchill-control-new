import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import { loadMusicConversationState } from "./CreativeMusicConversationStateRuntime.js";
import { settleCurrentMusicMaster } from "./CreativeMusicCurrentMasterRuntime.js";
import {
  buildMusicVersionLineage,
  compareMusicVersions,
  isMusicVersionAsset,
  verifyMusicVersionLineage,
} from "./CreativeMusicVersionLineageContract.js";

const RESTORE_CONTRACT = "AVANTIQO_MUSIC_VERSION_RESTORE_V1";
function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }

export async function inspectMusicVersionLineage({ organization_id, creative_project_id } = {}) {
  const loaded = await loadMusicConversationState({ organization_id, creative_project_id });
  const assets = await CreativeAssetsRuntime.list({ organization_id, creative_project_id, limit: 500 });
  return buildMusicVersionLineage({ assets, state: loaded.state });
}

export async function restoreMusicVersionAsNew({ organization_id, creative_project_id, historical_asset_id, summary = null } = {}) {
  if (!text(organization_id) || !text(creative_project_id) || !text(historical_asset_id)) throw new Error("CREATIVE_MUSIC_VERSION_RESTORE_REFERENCE_REQUIRED");
  const loaded = await loadMusicConversationState({ organization_id, creative_project_id });
  const assets = await CreativeAssetsRuntime.list({ organization_id, creative_project_id, limit: 500 });
  const lineage = buildMusicVersionLineage({ assets, state: loaded.state });
  if (!verifyMusicVersionLineage(lineage).valid) throw new Error("CREATIVE_MUSIC_VERSION_LINEAGE_INVALID");
  const historical = assets.find((asset) => text(asset.id) === text(historical_asset_id) && isMusicVersionAsset(asset));
  if (!historical || !(lineage.versions || []).some((node) => node.asset_id === text(historical.id))) throw new Error("CREATIVE_MUSIC_VERSION_RESTORE_ASSET_NOT_IN_LINEAGE");  const currentMasterId = text(loaded.state.current_master_asset_id);
  if (!currentMasterId) throw new Error("CREATIVE_MUSIC_VERSION_RESTORE_CURRENT_MASTER_REQUIRED");
  const nextVersion = Math.max(0, ...assets.filter(isMusicVersionAsset).map((asset) => finite(asset.metadata?.music_version, 0))) + 1;
  const restored = await CreativeAssetsRuntime.create({
    organization_id,
    creative_project_id,
    creative_mission_id: historical.creative_mission_id || loaded.project.creative_mission_id || null,
    asset_type: historical.asset_type || "AUDIO",
    file_url: historical.file_url || historical.url,
    name: `${text(historical.name || historical.title || "Music version")} — Restored v${nextVersion}`,
    title: `${text(historical.title || historical.name || "Music version")} — Restored v${nextVersion}`,
    description: "Non-destructive Music version restore from immutable historical audio.",
    metadata: {
      ...(historical.metadata || {}),
      media_kind: "MUSIC",
      music_version: nextVersion,
      music_operation: "VERSION_RESTORE",
      parent_music_asset_id: currentMasterId,
      restored_from_asset_id: historical.id,
      restore_source_music_version: historical.metadata?.music_version || null,
      publication_authorized: false,
      publish_authorized: false,
      immutable_history_preserved: true,
      audio_regeneration_performed: false,
      music_release_manifest: null,
      music_release_manifest_fingerprint: null,
      release_ready: false,
      music_release_ready: false,
      music_destination_qc: null,
      music_perceptual_translation_qc: null,
      music_dailies: null,
      music_final_tribunal: null,
      music_listening_evidence: null,
      restored_version_requires_revalidation: true,
    },
  });
  const settlement = await settleCurrentMusicMaster({
    organization_id,
    creative_project_id,
    master_asset_id: restored.id,
    parent_master_asset_id: currentMasterId,
    summary: text(summary) || `Restored Music version from ${historical.id}`,
  });  if (!settlement.persisted) throw new Error(settlement.error || "CREATIVE_MUSIC_VERSION_RESTORE_SETTLEMENT_FAILED");
  return {
    contract: RESTORE_CONTRACT,
    restored_asset: restored,
    restored_from_asset_id: historical.id,
    parent_master_asset_id: currentMasterId,
    music_version: nextVersion,
    audio_regeneration_performed: false,
    source_asset_overwritten: false,
    publish_authorized: false,
    settlement,
  };
}

export const CreativeMusicVersionLineageRuntime = Object.freeze({
  restoreContract: RESTORE_CONTRACT,
  inspect: inspectMusicVersionLineage,
  restoreAsNew: restoreMusicVersionAsNew,
  build: buildMusicVersionLineage,
  verify: verifyMusicVersionLineage,
  compare: compareMusicVersions,
});