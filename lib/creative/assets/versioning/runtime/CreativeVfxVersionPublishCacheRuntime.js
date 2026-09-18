import crypto from "node:crypto";

import * as AssetGraphRepository from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";

export const AVANTIQO_VFX_VERSION_PUBLISH_CACHE_CONTRACT =
  "AVANTIQO_VFX_VERSION_PUBLISH_CACHE_V1";

function text(value) { return String(value ?? "").trim(); }
function list(value) { return Array.isArray(value) ? value.filter(Boolean) : []; }
function hash(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function family(node = {}, familyKey = null) {
  return text(familyKey || node.metadata?.vfx_family_key || node.metadata?.shot_id || node.id);
}
function versionOf(node = {}) {
  return Number(node.metadata?.vfx_publish?.version || 0);
}
function dependencyDigest(dependencies = []) {
  return hash(list(dependencies).map((item) => ({
    asset_node_id: text(item.asset_node_id || item.id),
    checksum: text(item.checksum || item.technical?.checksum),
    publish_version: Number(item.publish_version || item.metadata?.vfx_publish?.version || 0),
  })).sort((a, b) => a.asset_node_id.localeCompare(b.asset_node_id)));
}

export async function publishVfxVersion({
  organization_id, creative_project_id, source_asset_node_id,
  family_key = null, department = "VFX", dependencies = [], note = null,
} = {}) {
  const source = await AssetGraphRepository.getById(source_asset_node_id);
  if (!source || text(source.organization_id) !== text(organization_id) ||
      text(source.creative_project_id) !== text(creative_project_id)) {
    throw new Error("VFX_PUBLISH_SOURCE_NOT_FOUND");
  }
  const familyKey = family(source, family_key);
  const nodes = await AssetGraphRepository.listByProject({
    organization_id, creative_project_id,
  });
  const prior = nodes
    .filter((node) => text(node.metadata?.vfx_family_key) === familyKey &&
      node.metadata?.vfx_publish?.status === "PUBLISHED")
    .sort((a, b) => versionOf(b) - versionOf(a));
  const version = (prior[0] ? versionOf(prior[0]) : 0) + 1;
  const dependencyHash = dependencyDigest(dependencies);
  const cacheKey = hash({
    family_key: familyKey,
    source_checksum: text(source.technical?.checksum),
    dependency_hash: dependencyHash,
    department: text(department).toUpperCase(),
  });
  const published = createCreativeAssetNode({
    ...source,
    id: undefined,
    status: CREATIVE_ASSET_NODE_STATUS.APPROVED,
    parent_asset_node_id: source.id,
    name: source.name + " v" + String(version).padStart(3, "0"),
    lineage: {
      ...(source.lineage || {}),
      source: "vfx_version_publish",
      source_asset_node_id: source.id,
      generation_version: version,
    },
    review: { ...(source.review || {}), approved: true },
    metadata: {
      ...(source.metadata || {}),
      vfx_family_key: familyKey,
      vfx_publish: {
        contract: AVANTIQO_VFX_VERSION_PUBLISH_CACHE_CONTRACT,
        status: "PUBLISHED",
        department: text(department).toUpperCase(),
        version,
        version_label: "v" + String(version).padStart(3, "0"),
        source_asset_node_id: source.id,
        source_checksum: text(source.technical?.checksum) || null,
        dependency_hash: dependencyHash,
        cache_key: cacheKey,
        note: text(note) || null,
        published_at: new Date().toISOString(),
      },
    },
  });
  const created = await AssetGraphRepository.create(published);
  for (const old of prior) {
    await AssetGraphRepository.update(old.id, {
      metadata: {
        ...(old.metadata || {}),
        vfx_publish: {
          ...(old.metadata?.vfx_publish || {}),
          status: "SUPERSEDED",
          superseded_by_asset_node_id: created.id,
          superseded_at: new Date().toISOString(),
        },
      },
    });
  }
  return {
    contract: AVANTIQO_VFX_VERSION_PUBLISH_CACHE_CONTRACT,
    status: "PUBLISHED",
    asset: created,
    version,
    cache_key: cacheKey,
    dependency_hash: dependencyHash,
    superseded_asset_node_ids: prior.map((node) => node.id),
  };
}
export function evaluateVfxCache({
  published_asset, current_dependencies = [], current_source_checksum = null,
} = {}) {
  const publish = published_asset?.metadata?.vfx_publish || {};
  const dependencyHash = dependencyDigest(current_dependencies);
  const sourceChecksum = text(current_source_checksum || published_asset?.technical?.checksum);
  const reasons = [];
  if (text(publish.status) !== "PUBLISHED") reasons.push("VFX_CACHE_VERSION_NOT_ACTIVE");
  if (text(publish.dependency_hash) !== dependencyHash) reasons.push("VFX_CACHE_DEPENDENCY_CHANGED");
  if (publish.source_checksum && text(publish.source_checksum) !== sourceChecksum) {
    reasons.push("VFX_CACHE_SOURCE_CHANGED");
  }
  return {
    contract: AVANTIQO_VFX_VERSION_PUBLISH_CACHE_CONTRACT,
    reusable: reasons.length === 0,
    invalidation_reasons: reasons,
    cache_key: publish.cache_key || null,
    dependency_hash: dependencyHash,
  };
}

export const CreativeVfxVersionPublishCacheRuntime = Object.freeze({
  contract: AVANTIQO_VFX_VERSION_PUBLISH_CACHE_CONTRACT,
  publish: publishVfxVersion,
  evaluateCache: evaluateVfxCache,
});
