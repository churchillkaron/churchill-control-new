import { createHash } from "node:crypto";

export const MUSIC_VERSION_LINEAGE_CONTRACT = "AVANTIQO_MUSIC_VERSION_LINEAGE_V1";
function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function hash(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32); }
function musicAsset(asset = {}) { return text(asset.metadata?.media_kind).toUpperCase() === "MUSIC" || finite(asset.metadata?.music_version, 0) > 0; }
function assetSummary(asset = {}) {
  return {
    asset_id: text(asset.id),
    music_version: Math.max(0, Math.round(finite(asset.metadata?.music_version, 0))),
    music_asset_kind: text(asset.metadata?.music_asset_kind || "SOURCE").toUpperCase(),
    operation: text(asset.metadata?.music_operation) || null,
    parent_asset_id: text(asset.metadata?.parent_music_asset_id) || null,
    restored_from_asset_id: text(asset.metadata?.restored_from_asset_id) || null,
    file_url: text(asset.file_url || asset.url) || null,
    created_at: text(asset.created_at) || null,
    name: text(asset.name || asset.title) || null,
  };
}
export function buildMusicVersionLineage({ assets = [], state = {} } = {}) {
  const byId = new Map(assets.filter(musicAsset).map((asset) => [text(asset.id), asset]));
  const lineage = (state.version_lineage || []).map((entry) => {
    const asset = byId.get(text(entry.master_asset_id || entry.id));
    if (!asset) return null;
    return { ...assetSummary(asset), summary: text(entry.summary) || null, parent_version_id: text(entry.parent_version_id) || null };
  }).filter(Boolean);
  const seen = new Set(lineage.map((node) => node.asset_id));
  for (const asset of assets.filter(musicAsset)) {
    if (seen.has(text(asset.id))) continue;
    lineage.push({ ...assetSummary(asset), summary: null, parent_version_id: null });
  }
  lineage.sort((a, b) => a.music_version - b.music_version || String(a.created_at || "").localeCompare(String(b.created_at || "")));
  const core = {
    contract: MUSIC_VERSION_LINEAGE_CONTRACT,
    current_master_asset_id: text(state.current_master_asset_id) || null,
    current_version_id: text(state.current_version_id) || null,
    versions: lineage.slice(-64),
    immutable_history: true,
    restore_creates_new_version: true,
    overwrite_existing_version: false,
  };
  return { ...core, lineage_fingerprint: hash(core) };
}

export function verifyMusicVersionLineage(lineage = {}) {
  const supplied = text(lineage.lineage_fingerprint);
  const { lineage_fingerprint: _ignored, ...core } = lineage || {};
  const expected = hash(core);
  return {
    contract: "AVANTIQO_MUSIC_VERSION_LINEAGE_VERIFICATION_V1",
    valid: Boolean(supplied && supplied === expected && core.contract === MUSIC_VERSION_LINEAGE_CONTRACT),
    supplied_fingerprint: supplied || null,
    expected_fingerprint: expected,
  };
}
export function compareMusicVersions(lineage = {}, leftAssetId, rightAssetId) {
  const left = (lineage.versions || []).find((item) => item.asset_id === text(leftAssetId));
  const right = (lineage.versions || []).find((item) => item.asset_id === text(rightAssetId));
  if (!left || !right) throw new Error("CREATIVE_MUSIC_VERSION_COMPARE_ASSET_NOT_FOUND");
  return {
    contract: "AVANTIQO_MUSIC_VERSION_COMPARE_V1",
    left,
    right,
    version_delta: right.music_version - left.music_version,
    operation_changed: left.operation !== right.operation,
    parent_changed: left.parent_asset_id !== right.parent_asset_id,
    audio_content_comparison_performed: false,
    measured_audio_difference_claimed: false,
  };
}

export function isMusicVersionAsset(asset = {}) {
  return musicAsset(asset);
}

export function summarizeMusicVersionAsset(asset = {}) {
  return assetSummary(asset);
}