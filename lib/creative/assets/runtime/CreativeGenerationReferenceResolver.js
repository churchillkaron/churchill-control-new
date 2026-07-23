import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";

import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";

function list(value) {
  if (!value) return [];
  return Array.isArray(value)
    ? value.filter(Boolean)
    : [value];
}

function uniqueStrings(values = []) {
  return [
    ...new Set(
      values
        .filter(Boolean)
        .map((value) => String(value).trim())
        .filter(Boolean),
    ),
  ];
}

function roleTokens(asset = {}) {
  return uniqueStrings([
    ...list(asset.reference_roles),
    ...list(asset.reference_role),
    ...list(asset.roles),
    ...list(asset.role),
    ...list(asset.metadata?.reference_roles),
    ...list(asset.metadata?.reference_role),
    ...list(asset.metadata?.roles),
    ...list(asset.metadata?.role),
    ...list(asset.analysis?.reference_roles),
    ...list(asset.analysis?.reference_role),
    ...list(asset.analysis?.roles),
    ...list(asset.analysis?.role),
    asset.ai_suggested_type,
    asset.asset_type,
    asset.type,
  ]).map((value) => value.toUpperCase());
}

function hasRole(asset, patterns = []) {
  const tokens = roleTokens(asset);
  return tokens.some((token) => (
    patterns.some((pattern) => pattern.test(token))
  ));
}

function isVenue(asset) {
  return hasRole(asset, [
    /VENUE/,
    /LOCATION/,
    /ENTRANCE/,
    /EXTERIOR/,
    /INTERIOR/,
    /ARCHITECTURE/,
    /ENVIRONMENT/,
    /SCENE_PLATE/,
  ]);
}

function isBrand(asset) {
  return hasRole(asset, [
    /BRAND/,
    /LOGO/,
    /WORDMARK/,
    /SIGNAGE/,
    /TYPOGRAPHY/,
  ]);
}

function isIdentity(asset) {
  return hasRole(asset, [
    /IDENTITY/,
    /PERSON/,
    /STAFF/,
    /CAST/,
    /CHARACTER/,
    /TALENT/,
    /EMPLOYEE/,
    /TEAM/,
  ]);
}

function isApproved(asset = {}) {
  const values = [
    asset.approved_reference,
    asset.approved,
    asset.status,
    asset.reuse_status,
    asset.metadata?.approved_reference,
    asset.metadata?.approved,
    asset.metadata?.status,
    asset.metadata?.reuse_status,
    asset.analysis?.approved_reference,
    asset.analysis?.approved,
  ];

  if (values.some((value) => value === false)) {
    return false;
  }

  return values.some((value) => (
    value === true ||
    ["APPROVED", "ACTIVE", "READY"].includes(
      String(value || "").toUpperCase(),
    )
  ));
}

function hasDelivery(asset = {}) {
  return Boolean(
    asset.image_url ||
    asset.file_url ||
    asset.url,
  );
}

function assetIdentity(asset = {}) {
  return String(
    asset.id ||
    asset.asset_id ||
    asset.image_url ||
    asset.file_url ||
    asset.url ||
    "",
  );
}

function dedupeAssets(assets = []) {
  const seen = new Set();
  const result = [];

  for (const asset of assets) {
    const key = assetIdentity(asset);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(asset);
  }

  return result;
}

function rankAsset(asset = {}, projectId = null) {
  let score = 0;

  if (isApproved(asset)) score += 100;
  if (hasDelivery(asset)) score += 50;
  if (
    projectId &&
    String(asset.creative_project_id || "") === String(projectId)
  ) {
    score += 25;
  }
  if (asset.ai_generated === false) score += 10;
  if (asset.metadata?.reference_source === "CREATIVE_ASSET") {
    score += 5;
  }

  return score;
}

function sorted(assets = [], projectId = null) {
  return [...assets].sort((left, right) => (
    rankAsset(right, projectId) - rankAsset(left, projectId) ||
    assetIdentity(left).localeCompare(assetIdentity(right))
  ));
}

async function loadProjectAssets({
  organization_id,
  creative_project_id,
}) {
  const project = await CreativeProjectRuntime.get(
    creative_project_id,
  );

  if (
    !project ||
    project.organization_id !== organization_id
  ) {
    throw new Error("CREATIVE_PROJECT_NOT_IN_ORGANIZATION");
  }

  const [projectAssets, missionAssets] = await Promise.all([
    CreativeAssetsRuntime.list({
      organization_id,
      creative_project_id,
      limit: 500,
    }),
    project.creative_mission_id
      ? CreativeAssetsRuntime.list({
          organization_id,
          creative_mission_id: project.creative_mission_id,
          limit: 500,
        })
      : Promise.resolve([]),
  ]);

  return {
    project,
    assets: dedupeAssets([
      ...(projectAssets || []),
      ...(missionAssets || []),
    ]).filter(hasDelivery),
  };
}

async function hydrateDelivery(assets = []) {
  const hydrated = await Promise.all(
    assets.map(async (asset) => (
      asset.id
        ? await CreativeAssetsRuntime.get(asset.id)
          .catch(() => asset)
        : asset
    )),
  );

  return hydrated.filter(hasDelivery);
}

export const CreativeGenerationReferenceResolver = {
  async resolve({
    organization_id,
    creative_project_id,
    include_unapproved_fallback = true,
  } = {}) {
    if (!organization_id) {
      throw new Error("organization_id required");
    }

    if (!creative_project_id) {
      throw new Error("creative_project_id required");
    }

    const { project, assets } = await loadProjectAssets({
      organization_id,
      creative_project_id,
    });

    const approved = assets.filter(isApproved);
    const candidatePool = approved.length
      ? approved
      : include_unapproved_fallback
        ? assets
        : [];

    const venue = sorted(
      candidatePool.filter(isVenue),
      creative_project_id,
    );
    const brand = sorted(
      candidatePool.filter(isBrand),
      creative_project_id,
    );
    const identity = sorted(
      candidatePool.filter(isIdentity),
      creative_project_id,
    );

    const selected = await hydrateDelivery(
      dedupeAssets([
        ...venue.slice(0, 3),
        ...brand.slice(0, 3),
        ...identity.slice(0, 12),
      ]),
    );

    const selectedIds = new Set(
      selected.map(assetIdentity),
    );

    return {
      project_id: project.id,
      mission_id: project.creative_mission_id || null,
      approved_assets_available: approved.length > 0,
      selected_assets: selected,
      venue_assets: selected.filter((asset) => (
        selectedIds.has(assetIdentity(asset)) && isVenue(asset)
      )),
      brand_assets: selected.filter((asset) => (
        selectedIds.has(assetIdentity(asset)) && isBrand(asset)
      )),
      identity_assets: selected.filter((asset) => (
        selectedIds.has(assetIdentity(asset)) && isIdentity(asset)
      )),
      counts: {
        available: assets.length,
        approved: approved.length,
        selected: selected.length,
        venue: venue.length,
        brand: brand.length,
        identity: identity.length,
      },
    };
  },
};
