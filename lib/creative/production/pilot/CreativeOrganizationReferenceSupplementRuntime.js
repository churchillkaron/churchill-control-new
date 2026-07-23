import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

function object(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  if (!value) return [];
  return Array.isArray(value)
    ? value.filter(Boolean)
    : [value];
}

function uniqueStrings(values = []) {
  return [...new Set(
    values
      .filter(Boolean)
      .map((value) => String(value).trim())
      .filter(Boolean),
  )];
}

function assetId(asset = {}) {
  if (typeof asset === "string") return asset;
  return String(asset.id || asset.asset_id || "");
}

function assetKey(asset = {}) {
  return (
    assetId(asset) ||
    asset.image_url ||
    asset.file_url ||
    asset.url ||
    null
  );
}

function dedupeAssets(values = []) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    if (!value) continue;
    const key = assetKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }

  return result;
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

function matches(asset, patterns = []) {
  return semanticTokens(asset).some((token) => (
    patterns.some((pattern) => pattern.test(token))
  ));
}

function isBrand(asset = {}) {
  return matches(asset, [
    /BRAND/,
    /LOGO/,
    /WORDMARK/,
    /SIGNAGE/,
    /TYPOGRAPHY/,
    /EMBLEM/,
  ]);
}

function isIdentity(asset = {}) {
  return matches(asset, [
    /IDENTITY/,
    /PERSON/,
    /PORTRAIT/,
    /STAFF/,
    /EMPLOYEE/,
    /TEAM/,
    /HOST/,
    /WAITER/,
    /WAITRESS/,
    /SERVER/,
    /BARTENDER/,
    /CHEF/,
    /MANAGER/,
    /TALENT/,
    /CAST/,
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

function score(asset = {}) {
  let value = 0;

  if (isApproved(asset)) value += 100;
  if (hasDelivery(asset)) value += 50;
  if (asset.ai_generated === false) value += 20;
  if (asset.favorite === true) value += 10;
  value += Math.min(10, Number(asset.usage_count || 0));

  return value;
}

function rank(values = []) {
  return [...values].sort((left, right) => (
    score(right) - score(left) ||
    assetKey(left).localeCompare(assetKey(right))
  ));
}

function preferredRoleAssets(values = [], predicate) {
  const matching = values.filter((asset) => (
    hasDelivery(asset) && predicate(asset)
  ));
  const approved = matching.filter(isApproved);

  return rank(approved.length ? approved : matching);
}

export const CreativeOrganizationReferenceSupplementRuntime = {
  async supplement({
    organization_id,
    creative_project_id,
    master_task_id,
  } = {}) {
    if (!organization_id) {
      throw new Error("organization_id required");
    }
    if (!creative_project_id) {
      throw new Error("creative_project_id required");
    }
    if (!master_task_id) {
      throw new Error("master_task_id required");
    }

    const scope = {
      organization_id,
      creative_project_id,
    };
    const [task, organizationAssets] = await Promise.all([
      ProductionTaskRuntime.get(master_task_id, scope),
      CreativeAssetsRuntime.list({
        organization_id,
        limit: 500,
      }),
    ]);

    if (!task) {
      throw new Error("MASTER_STILL_PILOT_TASK_REQUIRED");
    }

    const brands = preferredRoleAssets(
      organizationAssets || [],
      isBrand,
    ).slice(0, 3);
    const identities = preferredRoleAssets(
      organizationAssets || [],
      isIdentity,
    ).slice(0, 12);
    const input = object(task.input);
    const existing = dedupeAssets([
      ...list(input.reference_assets),
      ...list(input.assets),
    ]);
    const supplemented = dedupeAssets([
      ...existing,
      ...brands,
      ...identities,
    ]);

    const updated = await ProductionTaskRuntime.update(
      task.id,
      {
        input: {
          ...input,
          assets: supplemented,
          reference_assets: supplemented,
        },
        metadata: {
          ...object(task.metadata),
          organization_reference_supplement: {
            resolved_at: new Date().toISOString(),
            organization_asset_count:
              (organizationAssets || []).length,
            existing_reference_count: existing.length,
            brand_asset_ids:
              brands.map(assetId).filter(Boolean),
            identity_asset_ids:
              identities.map(assetId).filter(Boolean),
            supplemented_reference_count:
              supplemented.length,
          },
        },
      },
      scope,
    );

    return {
      task: updated,
      references: {
        organization_asset_count:
          (organizationAssets || []).length,
        existing_reference_count: existing.length,
        brand_asset_ids:
          brands.map(assetId).filter(Boolean),
        identity_asset_ids:
          identities.map(assetId).filter(Boolean),
        supplemented_reference_count:
          supplemented.length,
      },
    };
  },
};
