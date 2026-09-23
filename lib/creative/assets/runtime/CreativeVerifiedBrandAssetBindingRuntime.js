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


function reconcileLogoSourceReferences(value, bindingId) {
  if (Array.isArray(value)) return value.map((entry) => reconcileLogoSourceReferences(entry, bindingId));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => {
    if (/^(?:logo_source|logo_asset_id|brand_logo_asset_id)$/i.test(key) && typeof nested === "string" && text(nested) !== bindingId) {
      return [key, bindingId];
    }
    return [key, reconcileLogoSourceReferences(nested, bindingId)];
  }));
}

export function reconcileVerifiedBrandAssetPlan({ plan = {}, project = {}, assets = [] } = {}) {
  const bindingId = text(project?.metadata?.verified_brand_asset_binding?.asset_id);
  const suppliedAssets = list(assets);
  const suppliedIds = new Set(
    suppliedAssets.map((asset) => text(asset?.id || asset?.asset_id)).filter(Boolean),
  );

  let reconciledPlan = structuredClone(plan);
  let manifest = list(reconciledPlan.asset_manifest)
    .filter((entry) => {
      const id = text(entry?.asset_id || entry?.id || entry);
      if (!id || suppliedIds.has(id)) return true;
      return text(entry?.disposition).toUpperCase() !== "EXCLUDE";
    });

  const accountedIds = new Set(
    manifest.map((entry) => text(entry?.asset_id || entry?.id || entry)).filter(Boolean),
  );
  for (const asset of suppliedAssets) {
    const id = text(asset?.id || asset?.asset_id);
    if (!id || accountedIds.has(id) || id === bindingId) continue;
    manifest.push({
      asset_id: id,
      disposition: "EXCLUDE",
      reason: "Current project asset is not assigned by this recovered creative plan and remains excluded unless the active plan explicitly promotes it.",
      confidence: 100,
      assignments: [],
      restrictions: [],
      continuity_anchors: [],
      repair_requirements: [],
    });
    accountedIds.add(id);
  }
  reconciledPlan = { ...reconciledPlan, asset_manifest: manifest };

  if (!bindingId) return reconciledPlan;
  const boundAsset = suppliedAssets.find((asset) => text(asset?.id || asset?.asset_id) === bindingId);
  if (!boundAsset || !authoritativeBrandAsset(boundAsset)) return reconciledPlan;

  reconciledPlan = reconcileLogoSourceReferences(reconciledPlan, bindingId);
  manifest = list(reconciledPlan.asset_manifest).filter(
    (entry) => text(entry?.asset_id || entry?.id || entry) !== bindingId,
  );
  const assignments = list(reconciledPlan.deliverables).map((deliverable) => text(deliverable?.id)).filter(Boolean);
  if (!assignments.length) return { ...reconciledPlan, asset_manifest: manifest };

  return {
    ...reconciledPlan,
    asset_manifest: [
      ...manifest,
      {
        asset_id: bindingId,
        disposition: "REFERENCE",
        reason: "Use the verified organization-owned canonical brand asset as exact identity evidence for deterministic logo composition; never synthesize or redraw the mark.",
        confidence: 100,
        assignments,
        restrictions: {
          generated_logo_pixels_forbidden: true,
          preserve_exact_brand_mark: true,
        },
        continuity_anchors: {},
        repair_requirements: [
          "Preserve the exact verified brand mark and source provenance during every composition and bounded repair",
        ],
      },
    ],
  };
}

export const CreativeVerifiedBrandAssetBindingRuntime = Object.freeze({
  contract: CONTRACT,
  bind: bindVerifiedBrandAsset,
  reconcilePlan: reconcileVerifiedBrandAssetPlan,
});
