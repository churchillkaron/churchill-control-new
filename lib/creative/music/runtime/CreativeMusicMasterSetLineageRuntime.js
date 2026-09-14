import { createHash } from "node:crypto";

export const MUSIC_MASTER_SET_LINEAGE_CONTRACT = "AVANTIQO_MUSIC_MASTER_SET_LINEAGE_V1";

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}
function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function hash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
}

export function musicSourceGenerationId(sourceAsset = {}) {
  const existing = text(sourceAsset.metadata?.music_generation_id);
  if (existing) return existing;
  return `music-gen-${hash({
    asset_id: text(sourceAsset.id),
    version: finite(sourceAsset.metadata?.music_version, 0),
    parent_asset_id: text(sourceAsset.metadata?.parent_music_asset_id),
    operation: text(sourceAsset.metadata?.music_operation),
    restored_from_asset_id: text(sourceAsset.metadata?.restored_from_asset_id),
  })}`;
}
export function musicMasterSetId(sourceAsset = {}) {
  const existing = text(sourceAsset.metadata?.music_master_set_id);
  if (existing) return existing;
  return `music-master-set-${hash({
    source_generation_id: musicSourceGenerationId(sourceAsset),
    source_asset_id: text(sourceAsset.id),
  })}`;
}

export function buildMusicSourceGenerationMetadata(sourceAsset = {}, extra = {}) {
  const generationId = musicSourceGenerationId(sourceAsset);
  const masterSetId = musicMasterSetId(sourceAsset);
  return Object.freeze({
    music_generation_id: generationId,
    music_master_set_id: masterSetId,
    music_generation_source_asset_id: text(sourceAsset.id) || null,
    music_generation_parent_asset_id: text(sourceAsset.metadata?.parent_music_asset_id) || null,
    music_generation_reason: text(extra.reason || sourceAsset.metadata?.music_operation || "SOURCE") || "SOURCE",
    music_generation_current: true,
    music_master_set_current: false,
    music_master_set_release_ready: false,
  });
}

export function buildMusicMasterLineageMetadata({ sourceAsset = {}, variantId = null } = {}) {
  return Object.freeze({
    music_generation_id: musicSourceGenerationId(sourceAsset),
    music_master_set_id: musicMasterSetId(sourceAsset),
    music_generation_source_asset_id: text(sourceAsset.id) || null,
    source_asset_id: text(sourceAsset.id) || null,
    mastering_variant_id: text(variantId) || "default",
    music_master_set_current: true,
  });
}
function masterAsset(row = {}) {
  return object(row.finishing?.master_asset || row.master_asset || row);
}

export function evaluateMusicMasterSet({ sourceAsset = {}, masterVariants = [] } = {}) {
  const expectedGenerationId = musicSourceGenerationId(sourceAsset);
  const expectedMasterSetId = musicMasterSetId(sourceAsset);
  const rows = list(masterVariants).map((row) => {
    const asset = masterAsset(row);
    const metadata = object(asset.metadata);
    const sourceMatches = text(metadata.source_asset_id) === text(sourceAsset.id);
    const generationMatches = text(metadata.music_generation_id) === expectedGenerationId;
    const setMatches = text(metadata.music_master_set_id) === expectedMasterSetId;
    const current = metadata.music_master_set_current !== false;
    return {
      master_asset_id: text(asset.id) || null,
      variant_id: text(row.variant?.id || metadata.mastering_variant_id) || "default",
      source_asset_id: text(metadata.source_asset_id) || null,
      music_generation_id: text(metadata.music_generation_id) || null,
      music_master_set_id: text(metadata.music_master_set_id) || null,
      source_matches: sourceMatches,
      generation_matches: generationMatches,
      master_set_matches: setMatches,
      current,
      destination_qc_passed: row.destination_qc?.passed === true,
      perceptual_translation_passed: row.perceptual_translation?.passed === true,
    };
  });
  const complete = rows.length > 0 && rows.every((row) => row.master_asset_id);
  const lineageCurrent = complete && rows.every((row) => (
    row.source_matches && row.generation_matches && row.master_set_matches && row.current
  ));
  const qcCurrent = lineageCurrent && rows.every((row) => (
    row.destination_qc_passed && row.perceptual_translation_passed
  ));
  const seenGenerations = new Set(rows.map((row) => row.music_generation_id).filter(Boolean));
  const seenSets = new Set(rows.map((row) => row.music_master_set_id).filter(Boolean));
  const blockers = [];
  if (!complete) blockers.push("MASTER_SET_INCOMPLETE");
  if (complete && !lineageCurrent) blockers.push("MASTER_SET_STALE_OR_MIXED_GENERATION");
  if (lineageCurrent && !qcCurrent) blockers.push("MASTER_SET_QC_REQUIRED");
  return Object.freeze({
    contract: MUSIC_MASTER_SET_LINEAGE_CONTRACT,
    source_asset_id: text(sourceAsset.id) || null,
    expected_generation_id: expectedGenerationId,
    expected_master_set_id: expectedMasterSetId,
    masters: rows,
    complete,
    lineage_current: lineageCurrent,
    mixed_generation: seenGenerations.size > 1 || seenSets.size > 1 || (complete && !lineageCurrent),
    destination_and_translation_qc_current: qcCurrent,
    release_ready: qcCurrent,
    blockers,
    publication_authorized: false,
  });
}

export function musicMasterSetSummary(value = {}) {
  const source = object(value);
  return Object.freeze({
    contract: MUSIC_MASTER_SET_LINEAGE_CONTRACT,
    source_asset_id: text(source.source_asset_id) || null,
    generation_id: text(source.expected_generation_id) || null,
    master_set_id: text(source.expected_master_set_id) || null,
    master_count: list(source.masters).length,
    current: source.lineage_current === true,
    release_ready: source.release_ready === true,
    stale_or_mixed: source.mixed_generation === true,
    blockers: list(source.blockers),
    publication_authorized: false,
  });
}
export const CreativeMusicMasterSetLineageRuntime = Object.freeze({
  contract: MUSIC_MASTER_SET_LINEAGE_CONTRACT,
  generationId: musicSourceGenerationId,
  masterSetId: musicMasterSetId,
  sourceMetadata: buildMusicSourceGenerationMetadata,
  masterMetadata: buildMusicMasterLineageMetadata,
  evaluate: evaluateMusicMasterSet,
  summarize: musicMasterSetSummary,
});
