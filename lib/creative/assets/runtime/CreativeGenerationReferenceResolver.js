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

function semanticTokens(asset = {}) {
  return uniqueStrings([
    ...list(asset.reference_roles),
    ...list(asset.reference_role),
    ...list(asset.roles),
    ...list(asset.role),
    ...list(asset.tags),
    ...list(asset.labels),
    ...list(asset.metadata?.reference_roles),
    ...list(asset.metadata?.reference_role),
    ...list(asset.metadata?.roles),
    ...list(asset.metadata?.role),
    ...list(asset.metadata?.tags),
    ...list(asset.metadata?.labels),
    ...list(asset.analysis?.reference_roles),
    ...list(asset.analysis?.reference_role),
    ...list(asset.analysis?.roles),
    ...list(asset.analysis?.role),
    ...list(asset.analysis?.tags),
    ...list(asset.analysis?.labels),
    asset.ai_suggested_type,
    asset.asset_type,
    asset.type,
    asset.name,
    asset.title,
    asset.file_name,
    asset.filename,
    asset.description,
    asset.caption,
    asset.metadata?.name,
    asset.metadata?.title,
    asset.metadata?.file_name,
    asset.metadata?.description,
    asset.metadata?.caption,
    asset.analysis?.summary,
    asset.analysis?.description,
    asset.analysis?.classification,
    asset.analysis?.subject,
  ]).map((value) => value.toUpperCase());
}

function hasSemanticRole(asset, patterns = []) {
  const tokens = semanticTokens(asset);
  return tokens.some((token) => (
    patterns.some((pattern) => pattern.test(token))
  ));
}

function isVenue(asset) {
  return hasSemanticRole(asset, [
    /VENUE/,
    /LOCATION/,
    /ENTRANCE/,
    /EXTERIOR/,
    /INTERIOR/,
    /ARCHITECTURE/,
    /ENVIRONMENT/,
    /SCENE[ _-]?PLATE/,
    /BUILDING/,
    /FACADE/,
    /FACADE/,
    /DOORWAY/,
    /STORE ?FRONT/,
  ]);
}

function isBrand(asset) {
  return hasSemanticRole(asset, [
    /BRAND/,
    /LOGO/,
    /WORDMARK/,
    /SIGNAGE/,
    /TYPOGRAPHY/,
    /EMBLEM/,
    /MARK/,
  ]);
}

function isIdentity(asset) {
  return hasSemanticRole(asset, [
    /IDENTITY/,
    /PERSON/,
    /PORTRAIT/,
    /STAFF/,
    /CAST/,
    /CHARACTER/,
    /TALENT/,
    /EMPLOYEE/,
    /TEAM/,
    /HOST/,
    /WAITER/,
    /SERVER/,
    /BARTENDER/,
    /CHEF/,
    /MANAGER/,
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

function resolveUrl(asset = {}) {
  return (
    asset.image_url ||
    asset.file_url ||
    asset.url ||
    asset.thumbnail_url ||
    null
  );
}

function hasDelivery(asset = {}) {
  return Boolean(resolveUrl(asset));
}

function isImageAsset(asset = {}) {
  const mimeType = String(
    asset.mime_type ||
    asset.metadata?.mime_type ||
    asset.technical?.mime_type ||
    "",
  ).toLowerCase();
  const url = String(resolveUrl(asset) || "").toLowerCase();

  if (mimeType.startsWith("video/")) return false;
  if (mimeType.startsWith("image/")) return true;

  return ![
    ".mp4",
    ".mov",
    ".webm",
    ".m4v",
    ".avi",
  ].some((extension) => url.includes(extension));
}

function assetIdentity(asset = {}) {
  return String(
    asset.id ||
    asset.asset_id ||
    resolveUrl(asset) ||
    "",
  );
}

function dedupeAssets(assets = []) {
  const seen = new Set();
  const result = [];

  for (const asset of assets) {
    if (!asset) continue;
    const key = assetIdentity(asset);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(asset);
  }

  return result;
}

async function hydrateAsset(value) {
  if (!value) return null;

  if (typeof value === "string") {
    return CreativeAssetsRuntime.get(value).catch(() => null);
  }

  if (value.id) {
    const stored = await CreativeAssetsRuntime.get(value.id)
      .catch(() => null);

    return stored
      ? {
          ...stored,
          ...value,
          metadata: {
            ...(stored.metadata || {}),
            ...(value.metadata || {}),
          },
          analysis: {
            ...(stored.analysis || {}),
            ...(value.analysis || {}),
          },
        }
      : value;
  }

  return value;
}

async function hydrateAssets(values = []) {
  const hydrated = await Promise.all(
    values.map(hydrateAsset),
  );

  return dedupeAssets(
    hydrated.filter((asset) => asset && hasDelivery(asset)),
  );
}

function rankAsset({
  asset,
  projectId = null,
  preferredIds = new Set(),
} = {}) {
  let score = 0;
  const id = assetIdentity(asset);

  if (preferredIds.has(id)) score += 1000;
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

function sorted(
  assets = [],
  projectId = null,
  preferredIds = new Set(),
) {
  return [...assets].sort((left, right) => (
    rankAsset({
      asset: right,
      projectId,
      preferredIds,
    }) - rankAsset({
      asset: left,
      projectId,
      preferredIds,
    }) ||
    assetIdentity(left).localeCompare(assetIdentity(right))
  ));
}

function rolePool({
  assets = [],
  predicate,
  includeUnapprovedFallback = true,
  projectId = null,
  preferredIds = new Set(),
} = {}) {
  const matching = assets.filter(predicate);
  const approved = matching.filter(isApproved);
  const selected = approved.length
    ? approved
    : includeUnapprovedFallback
      ? matching
      : [];

  return sorted(selected, projectId, preferredIds);
}

function contextualVenueFallback({
  preferredAssets = [],
  projectId = null,
  preferredIds = new Set(),
} = {}) {
  return sorted(
    preferredAssets.filter((asset) => (
      isImageAsset(asset) &&
      !isBrand(asset) &&
      !isIdentity(asset)
    )),
    projectId,
    preferredIds,
  );
}

async function loadProjectAssets({
  organization_id,
  creative_project_id,
  preferred_assets = [],
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

  const [projectAssets, missionAssets, preferredAssets] =
    await Promise.all([
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
      hydrateAssets(preferred_assets),
    ]);

  const assets = await hydrateAssets([
    ...preferredAssets,
    ...(projectAssets || []),
    ...(missionAssets || []),
  ]);

  return {
    project,
    assets,
    preferredAssets,
  };
}

export const CreativeGenerationReferenceResolver = {
  async resolve({
    organization_id,
    creative_project_id,
    preferred_assets = [],
    include_unapproved_fallback = true,
  } = {}) {
    if (!organization_id) {
      throw new Error("organization_id required");
    }

    if (!creative_project_id) {
      throw new Error("creative_project_id required");
    }

    const {
      project,
      assets,
      preferredAssets,
    } = await loadProjectAssets({
      organization_id,
      creative_project_id,
      preferred_assets,
    });
    const preferredIds = new Set(
      preferredAssets.map(assetIdentity),
    );

    let venue = rolePool({
      assets,
      predicate: isVenue,
      includeUnapprovedFallback: include_unapproved_fallback,
      projectId: creative_project_id,
      preferredIds,
    });
    const brand = rolePool({
      assets,
      predicate: isBrand,
      includeUnapprovedFallback: include_unapproved_fallback,
      projectId: creative_project_id,
      preferredIds,
    });
    const identity = rolePool({
      assets,
      predicate: isIdentity,
      includeUnapprovedFallback: include_unapproved_fallback,
      projectId: creative_project_id,
      preferredIds,
    });

    let venueResolution = venue.length
      ? "SEMANTIC_ROLE"
      : null;

    if (!venue.length) {
      venue = contextualVenueFallback({
        preferredAssets,
        projectId: creative_project_id,
        preferredIds,
      });
      venueResolution = venue.length
        ? "TASK_REFERENCE_CONTEXT"
        : null;
    }

    const selected = await hydrateAssets(
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
      approved_assets_available:
        assets.some(isApproved),
      selected_assets: selected,
      venue_assets: selected.filter((asset) => (
        selectedIds.has(assetIdentity(asset)) &&
        venue.some((candidate) => (
          assetIdentity(candidate) === assetIdentity(asset)
        ))
      )),
      brand_assets: selected.filter((asset) => (
        selectedIds.has(assetIdentity(asset)) &&
        brand.some((candidate) => (
          assetIdentity(candidate) === assetIdentity(asset)
        ))
      )),
      identity_assets: selected.filter((asset) => (
        selectedIds.has(assetIdentity(asset)) &&
        identity.some((candidate) => (
          assetIdentity(candidate) === assetIdentity(asset)
        ))
      )),
      resolution: {
        venue: venueResolution,
        preferred_reference_count: preferredAssets.length,
        role_approval_scope: "PER_ROLE",
      },
      counts: {
        available: assets.length,
        approved: assets.filter(isApproved).length,
        preferred: preferredAssets.length,
        selected: selected.length,
        venue: venue.length,
        brand: brand.length,
        identity: identity.length,
      },
    };
  },
};
