import { CreativeAssetsRuntime } from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import { CreativeProjectRuntime } from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

const CONTRACT = "CREATIVE_VERIFIED_BRAND_ASSET_BINDING_V1";

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function roles(asset = {}) {
  return new Set([
    ...list(asset?.metadata?.reference_role_evidence?.supported_roles),
    ...list(asset?.analysis?.reference_role_evidence?.supported_roles),
  ].map(upper));
}

function verified(asset = {}) {
  return asset?.metadata?.verified === true ||
    asset?.analysis?.verified === true ||
    upper(asset?.metadata?.semantic_analysis_status) === "VERIFIED" ||
    upper(asset?.analysis?.semantic_status) === "VERIFIED";
}

function usableSource(asset = {}) {
  return Boolean(text(asset?.file_url || asset?.image_url || asset?.thumbnail_url));
}

function authoritativeBrandAsset(asset = {}) {
  if (asset?.ai_generated === true) return false;
  if (upper(asset?.asset_type) !== "LOGO") return false;
  const evidence = roles(asset);
  const canonical = asset?.metadata?.canonical_brand_asset === true ||
    upper(asset?.metadata?.project_role) === "CANONICAL_BRAND_LOGO" ||
    upper(asset?.metadata?.source) === "AVANTIQO_CANONICAL_BRAND_ASSET";
  const roleVerified = verified(asset) && evidence.has("BRAND_REFERENCE") && evidence.has("PRIMARY_SOURCE");
  return usableSource(asset) && (canonical || roleVerified);
}

function score(asset = {}) {
  const evidence = roles(asset);
  let value = 0;
  if (asset?.metadata?.canonical_brand_asset === true) value += 100;
  if (upper(asset?.metadata?.project_role) === "CANONICAL_BRAND_LOGO") value += 80;
  if (verified(asset)) value += 40;
  if (evidence.has("BRAND_REFERENCE")) value += 30;
  if (evidence.has("PRIMARY_SOURCE")) value += 20;
  if (asset?.analysis?.rights?.status === "ORGANIZATION_OWNED") value += 15;
  if (usableSource(asset)) value += 10;
  return value;
}

export async function bindVerifiedBrandAsset({ organization_id, creative_project_id, project = null } = {}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");
  const currentProject = project || await CreativeProjectRuntime.get(creative_project_id);
  if (!currentProject || text(currentProject.organization_id) !== text(organization_id)) {
    throw new Error("Creative project not found");
  }

  const metadata = currentProject.metadata || {};
  const selectedIds = [...new Set(list(metadata.selected_asset_ids).map(text).filter(Boolean))];
  const organizationAssets = await CreativeAssetsRuntime.list({ organization_id, limit: 1000 });
  const byId = new Map(organizationAssets.map((asset) => [text(asset.id), asset]));
  const alreadyBound = selectedIds.map((id) => byId.get(id)).find(authoritativeBrandAsset);
  if (alreadyBound) return { project: currentProject, asset: alreadyBound, changed: false };

  const candidate = organizationAssets
    .filter(authoritativeBrandAsset)
    .sort((left, right) => score(right) - score(left) || text(left.id).localeCompare(text(right.id)))[0];
  if (!candidate) return { project: currentProject, asset: null, changed: false };

  const nextMetadata = {
    ...metadata,
    selected_asset_ids: [...selectedIds, candidate.id],
    verified_brand_asset_binding: {
      contract: CONTRACT,
      asset_id: candidate.id,
      source: "AUTOMATIC_VERIFIED_ORGANIZATION_BRAND_ASSET",
      bound_at: new Date().toISOString(),
    },
  };
  const updated = await CreativeProjectRuntime.update(creative_project_id, { metadata: nextMetadata });
  return { project: updated, asset: candidate, changed: true };
}

export const CreativeVerifiedBrandAssetBindingRuntime = Object.freeze({
  contract: CONTRACT,
  bind: bindVerifiedBrandAsset,
});
