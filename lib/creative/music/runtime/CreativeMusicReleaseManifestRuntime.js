import crypto from "node:crypto";

export const MUSIC_RELEASE_MANIFEST_CONTRACT = "AVANTIQO_MUSIC_RELEASE_MANIFEST_V1";

function text(value, max = 4000) {
  return String(value ?? "").trim().slice(0, max);
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function fingerprint(value) {
  return crypto.createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
function deliveryRows(asset = {}) {
  return list(asset.metadata?.deliveries)
    .filter((file) => text(file?.url) && text(file?.mime_type).startsWith("audio/"))
    .slice(0, 12)
    .map((file) => ({
      delivery_id: text(file.delivery_id) || null,
      name: text(file.name) || null,
      url: text(file.url) || null,
      mime_type: text(file.mime_type) || null,
      checksum: text(file.checksum) || null,
      storage_path: text(file.storage_path) || null,
      codec_name: text(file.probe?.codec_name) || null,
      sample_rate: finite(file.probe?.sample_rate),
      channels: finite(file.probe?.channels),
      bit_rate: finite(file.probe?.bit_rate),
    }));
}

function masterRow(row = {}) {
  const asset = object(row.finishing?.master_asset);
  const metadata = object(asset.metadata);
  const report = object(metadata.master_report);
  const measured = object(report.master);
  return {
    variant_id: text(row.variant?.id || metadata.mastering_variant_id) || null,
    destinations: list(row.variant?.destinations || metadata.mastering_destinations).map((value) => text(value)).filter(Boolean),
    master_asset_id: text(asset.id) || null,
    master_id: text(metadata.master_id || report.master_id) || null,
    file_url: text(asset.file_url) || null,
    file_name: text(asset.file_name) || null,
    integrated_lufs: finite(measured.integrated_lufs ?? metadata.integrated_lufs),
    true_peak_dbtp: finite(measured.true_peak_dbtp ?? metadata.true_peak_dbtp),
    destination_qc_passed: row.destination_qc?.passed === true,
    perceptual_translation_passed: row.perceptual_translation?.passed === true,
    perceptual_translation_contract: text(row.perceptual_translation?.contract) || null,
    deliveries: deliveryRows(asset),
  };
}
export function buildMusicReleaseManifest({
  organization_id,
  creative_project_id,
  creative_mission_id = null,
  source_asset = {},
  finishing = {},
  dailies = {},
  tribunal = {},
  release_ready = false,
} = {}) {
  if (!text(organization_id)) throw new Error("CREATIVE_MUSIC_RELEASE_ORGANIZATION_REQUIRED");
  if (!text(creative_project_id)) throw new Error("CREATIVE_MUSIC_RELEASE_PROJECT_REQUIRED");
  if (!text(source_asset?.id)) throw new Error("CREATIVE_MUSIC_RELEASE_SOURCE_ASSET_REQUIRED");

  const masters = list(finishing.master_variants).map(masterRow);
  const core = {
    contract: MUSIC_RELEASE_MANIFEST_CONTRACT,
    organization_id: text(organization_id),
    creative_project_id: text(creative_project_id),
    creative_mission_id: text(creative_mission_id) || null,
    source: {
      asset_id: text(source_asset.id),
      version: finite(source_asset.metadata?.music_version),
      usage_id: text(source_asset.metadata?.music_usage_id) || null,
      generation_seed: finite(source_asset.metadata?.generation_seed),
      preproduction_hash: text(source_asset.metadata?.music_preproduction_hash) || null,
      direction_hash: text(source_asset.metadata?.music_direction_hash) || null,
      owned_engine: source_asset.metadata?.owned_engine === true,
    },
    mastering: {
      contract: text(finishing.mastering_plan?.contract) || null,
      requested: list(finishing.mastering_plan?.requested).map((value) => text(value)).filter(Boolean),
      separate_masters_required: finishing.mastering_plan?.separate_masters_required === true,
      destination_qc_passed: finishing.destination_qc_passed === true,
      perceptual_translation_passed: finishing.perceptual_translation_passed === true,
    },
    masters,
    quality: {
      dailies_passed: dailies?.report?.passed === true,
      tribunal_release_ready: tribunal?.release_ready === true,
      release_ready: release_ready === true,
    },
    governance: {
      mutation_authorized: false,
      publication_authorized: false,
      exact_project_scope_required: true,
      immutable_delivery_identity_required: true,
    },
  };

  return Object.freeze({
    ...core,
    manifest_fingerprint: fingerprint(core),
  });
}

export function verifyMusicReleaseManifest(manifest = {}) {
  const value = object(manifest);
  const claimed = text(value.manifest_fingerprint);
  if (!claimed || text(value.contract) !== MUSIC_RELEASE_MANIFEST_CONTRACT) return false;
  const { manifest_fingerprint: _ignored, ...core } = value;
  return fingerprint(core) === claimed;
}

export function musicReleasePackageSummary(manifest = {}) {
  const verified = verifyMusicReleaseManifest(manifest);
  return Object.freeze({
    contract: MUSIC_RELEASE_MANIFEST_CONTRACT,
    verified,
    release_ready: verified && manifest.quality?.release_ready === true,
    master_count: list(manifest.masters).length,
    delivery_count: list(manifest.masters).reduce((sum, row) => sum + list(row.deliveries).length, 0),
    destinations: [...new Set(list(manifest.masters).flatMap((row) => list(row.destinations)).map((value) => text(value)).filter(Boolean))],
    manifest_fingerprint: verified ? text(manifest.manifest_fingerprint) : null,
    publication_authorized: false,
  });
}

export const CreativeMusicReleaseManifestRuntime = Object.freeze({
  contract: MUSIC_RELEASE_MANIFEST_CONTRACT,
  build: buildMusicReleaseManifest,
  verify: verifyMusicReleaseManifest,
  summarize: musicReleasePackageSummary,
});
