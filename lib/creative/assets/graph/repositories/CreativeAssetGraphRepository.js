import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
  CREATIVE_ASSET_NODE_TYPES,
} from "../documents/CreativeAssetNode";

const TABLE = "creative_asset_nodes";
const ASSET_TABLE = "creative_assets";

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function metadataIdentityQuery({
  organization_id,
  type,
  metadata_key,
  metadata_value,
}) {
  return supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .eq("type", type)
    .eq(`metadata->>${metadata_key}`, metadata_value)
    .neq("status", "ARCHIVED")
    .order("created_at", { ascending: true })
    .limit(1);
}

export async function create(node) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert(node)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createOrFindByMetadataIdentity({
  node,
  metadata_key,
  metadata_value,
}) {
  if (!node?.organization_id) throw new Error("organization_id required");
  if (!node?.type) throw new Error("type required");
  if (!metadata_key) throw new Error("metadata_key required");
  if (!metadata_value) throw new Error("metadata_value required");

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert(node)
    .select()
    .single();

  if (!error) return { node: data, created: true };
  if (error.code !== "23505") throw error;

  const { data: existing, error: existingError } =
    await metadataIdentityQuery({
      organization_id: node.organization_id,
      type: node.type,
      metadata_key,
      metadata_value,
    }).maybeSingle();

  if (existingError) throw existingError;
  if (!existing) throw error;
  return { node: existing, created: false };
}

export async function getById(id) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function update(id, values) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update({
      ...values,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

function sourceNodeRank(node = {}) {
  return (
    (node.review?.approved === true ? 100 : 0) +
    (node.review?.human_reviewed === true ? 40 : 0) +
    (node.review?.ai_reviewed === true ? 20 : 0) +
    (node.parent_asset_node_id ? -20 : 30) +
    (node.creative_project_id ? -10 : 20) +
    (["APPROVED", "IMPORTED"].includes(String(node.status || "").toUpperCase()) ? 20 : 0) +
    (node.url || node.storage_path ? 10 : 0)
  );
}

function extension(value) {
  const source = text(value).toLowerCase().split(/[?#]/)[0];
  return source.match(/\.([a-z0-9]+)$/)?.[1] || "";
}

function assetUrl(asset = {}) {
  return asset.file_url || asset.image_url || asset.thumbnail_url || null;
}

function originalFileName(asset = {}) {
  return text(
    asset.metadata?.original_file_name ||
    asset.analysis?.storage_evidence?.original_file_name ||
    asset.file_name ||
    asset.name,
  );
}

function assetMimeType(asset = {}) {
  return text(
    asset.mime_type ||
    asset.metadata?.mime_type ||
    asset.analysis?.technical_inspection?.mime_type ||
    asset.analysis?.storage_evidence?.mime_type,
  ).toLowerCase();
}

function assetNodeType(asset = {}) {
  const mime = assetMimeType(asset);
  const type = text(asset.asset_type || asset.type).toLowerCase();
  const ext = extension(originalFileName(asset) || assetUrl(asset));

  if (
    mime.startsWith("video/") ||
    type.includes("video") ||
    ["mp4", "mov", "m4v", "webm", "mkv", "avi"].includes(ext)
  ) {
    return CREATIVE_ASSET_NODE_TYPES.VIDEO;
  }
  if (
    mime.startsWith("audio/") ||
    type.includes("audio") ||
    ["mp3", "wav", "m4a", "aac", "flac", "ogg"].includes(ext)
  ) {
    return CREATIVE_ASSET_NODE_TYPES.AUDIO;
  }
  if (
    mime.startsWith("image/") ||
    type.includes("image") ||
    type.includes("logo") ||
    ["jpg", "jpeg", "png", "webp", "gif", "avif", "heic", "heif"].includes(ext)
  ) {
    return type.includes("logo")
      ? CREATIVE_ASSET_NODE_TYPES.LOGO
      : CREATIVE_ASSET_NODE_TYPES.IMAGE;
  }
  return CREATIVE_ASSET_NODE_TYPES.ASSET;
}

function assetVerification(asset = {}) {
  const statuses = [
    asset.status,
    asset.review?.status,
    asset.analysis?.status,
    asset.metadata?.analysis_status,
    asset.metadata?.verification_status,
  ].map((value) => text(value).toUpperCase());
  const approved = Boolean(
    asset.review?.approved === true ||
    asset.metadata?.verified === true ||
    asset.metadata?.asset_verified === true ||
    asset.metadata?.analysis_complete === true ||
    asset.analysis?.verified === true ||
    statuses.some((status) => [
      "APPROVED",
      "VERIFIED",
      "COMPLETE",
      "COMPLETED",
      "READY",
      "ACTIVE",
      "ANALYSED",
      "ANALYZED",
    ].includes(status)),
  );

  return {
    approved,
    aiReviewed: Boolean(
      asset.review?.ai_reviewed === true ||
      asset.metadata?.analysis_complete === true ||
      asset.analysis?.verified === true ||
      statuses.some((status) => [
        "VERIFIED",
        "COMPLETE",
        "COMPLETED",
        "ANALYSED",
        "ANALYZED",
      ].includes(status)),
    ),
    humanReviewed: asset.review?.human_reviewed === true,
  };
}

function assetAvailable(asset = {}, organizationId) {
  if (!asset?.id || String(asset.organization_id) !== String(organizationId)) {
    return false;
  }
  if (asset.archived === true || asset.disabled === true || asset.deleted_at) {
    return false;
  }
  const status = text(asset.status).toUpperCase();
  if (["ARCHIVED", "DISABLED", "DELETED", "REJECTED", "FAILED"].includes(status)) {
    return false;
  }
  return Boolean(assetUrl(asset));
}

function canonicalSourceNode({ organization_id, asset }) {
  const verification = assetVerification(asset);
  const analysis = asset.analysis || {};
  const technicalInspection = analysis.technical_inspection || {};
  const storageEvidence = analysis.storage_evidence || {};
  const intelligence = analysis.intelligence || {};
  const sourceIdentity = `${organization_id}:${asset.id}`;
  const nodeType = assetNodeType(asset);

  return createCreativeAssetNode({
    organization_id,
    creative_project_id: null,
    creative_asset_id: asset.id,
    parent_asset_node_id: null,
    type: nodeType,
    status: verification.approved
      ? CREATIVE_ASSET_NODE_STATUS.APPROVED
      : CREATIVE_ASSET_NODE_STATUS.IMPORTED,
    name:
      asset.name ||
      asset.title ||
      originalFileName(asset) ||
      `Creative asset ${asset.id}`,
    description: asset.description || analysis.description || "",
    url: assetUrl(asset),
    storage_path:
      asset.metadata?.storage_path ||
      storageEvidence.storage_path ||
      null,
    lineage: {
      source: "creative_asset_record",
      source_creative_asset_id: asset.id,
      capability: "creative.asset.materialize-source-node",
      generation_version: 1,
    },
    technical: {
      mime_type: assetMimeType(asset) || null,
      width: finite(
        technicalInspection.width ??
        analysis.width ??
        asset.metadata?.width,
      ),
      height: finite(
        technicalInspection.height ??
        analysis.height ??
        asset.metadata?.height,
      ),
      duration_seconds: finite(
        technicalInspection.duration_seconds ??
        analysis.duration_seconds ??
        asset.metadata?.duration_seconds,
      ),
      checksum:
        storageEvidence.checksum_sha256 ||
        storageEvidence.checksum ||
        asset.metadata?.checksum_sha256 ||
        asset.metadata?.checksum ||
        null,
    },
    intelligence: {
      ...intelligence,
      verified: verification.approved,
      source_asset_analysis: analysis,
      tags: Array.isArray(asset.tags)
        ? asset.tags
        : Array.isArray(analysis.tags)
          ? analysis.tags
          : [],
      detected_products: Array.isArray(intelligence.detected_products)
        ? intelligence.detected_products
        : [],
      detected_people: Array.isArray(intelligence.detected_people)
        ? intelligence.detected_people
        : [],
      detected_locations: Array.isArray(intelligence.detected_locations)
        ? intelligence.detected_locations
        : [],
    },
    cost: {
      currency: null,
      estimated: 0,
      actual: 0,
      saved_by_reuse: 0,
    },
    reuse: {
      reusable: true,
      approved_for_reuse: verification.approved,
      reuse_count: Number(asset.usage_count || 0),
    },
    review: {
      ai_reviewed: verification.aiReviewed,
      human_reviewed: verification.humanReviewed,
      approved: verification.approved,
      approved_by: asset.review?.approved_by || null,
      notes: asset.review?.notes || "Materialized from verified creative asset record.",
    },
    metadata: {
      canonical_source_node: true,
      canonical_source_identity: sourceIdentity,
      source_creative_asset_id: asset.id,
      original_file_name: originalFileName(asset) || null,
      source_asset_type: asset.asset_type || null,
      source_asset_metadata: asset.metadata || {},
      materialized_at: new Date().toISOString(),
    },
    created_by: asset.created_by || null,
  });
}

async function findCanonicalSourceNode({ organization_id, creative_asset_id }) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .eq("creative_asset_id", creative_asset_id)
    .is("creative_project_id", null)
    .is("parent_asset_node_id", null)
    .neq("status", "ARCHIVED")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function materializeMissingSourceNodes({
  organization_id,
  creative_asset_ids,
  byAsset,
}) {
  if (!creative_asset_ids.length) return;

  const { data: assets, error } = await supabaseAdmin
    .from(ASSET_TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .in("id", creative_asset_ids)
    .eq("archived", false);

  if (error) throw error;

  const assetById = new Map(
    (assets || []).map((asset) => [String(asset.id), asset]),
  );
  const notFound = creative_asset_ids.filter((id) => !assetById.has(id));
  if (notFound.length) {
    throw new Error(`CREATIVE_SELECTED_ASSETS_MISSING:${notFound.join(",")}`);
  }

  for (const creativeAssetId of creative_asset_ids) {
    const asset = assetById.get(creativeAssetId);
    if (!assetAvailable(asset, organization_id)) {
      throw new Error(`CREATIVE_SELECTED_ASSET_UNAVAILABLE:${creativeAssetId}`);
    }

    let source = await findCanonicalSourceNode({
      organization_id,
      creative_asset_id: creativeAssetId,
    });
    if (!source) {
      source = await create(canonicalSourceNode({
        organization_id,
        asset,
      }));
    }
    byAsset.get(creativeAssetId).push(source);
  }
}

function projectReferenceNode({
  organization_id,
  creative_project_id,
  creative_asset_id,
  source,
}) {
  const referenceIdentity = `${creative_project_id}:${creative_asset_id}`;
  return createCreativeAssetNode({
    organization_id,
    creative_project_id,
    creative_asset_id,
    parent_asset_node_id: source.id,
    type: source.type,
    status:
      source.status === CREATIVE_ASSET_NODE_STATUS.APPROVED ||
      source.review?.approved === true
        ? CREATIVE_ASSET_NODE_STATUS.APPROVED
        : CREATIVE_ASSET_NODE_STATUS.IMPORTED,
    name: source.name,
    description: source.description,
    url: source.url,
    storage_path: source.storage_path,
    lineage: {
      ...(source.lineage || {}),
      source: "project_asset_reference",
      source_asset_node_id: source.id,
      source_creative_project_id: source.creative_project_id || null,
    },
    technical: source.technical || {},
    intelligence: source.intelligence || {},
    cost: {
      ...(source.cost || {}),
      estimated: 0,
      actual: 0,
      saved_by_reuse: Number(source.cost?.estimated || source.cost?.actual || 0),
    },
    reuse: {
      ...(source.reuse || {}),
      reusable: true,
      approved_for_reuse:
        source.reuse?.approved_for_reuse === true ||
        source.review?.approved === true,
      reuse_count: Number(source.reuse?.reuse_count || 0) + 1,
    },
    review: source.review || {},
    metadata: {
      ...(source.metadata || {}),
      canonical_source_node: false,
      project_asset_reference: true,
      project_asset_reference_identity: referenceIdentity,
      source_asset_node_id: source.id,
      selected_for_project: true,
      selected_for_project_at: new Date().toISOString(),
    },
  });
}

export async function attachAssetsToProject({
  organization_id,
  creative_project_id,
  creative_asset_ids = [],
} = {}) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_project_id) throw new Error("creative_project_id required");

  const ids = [...new Set(
    (Array.isArray(creative_asset_ids) ? creative_asset_ids : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  )];
  if (!ids.length) return [];

  const { data: nodes, error: lookupError } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .in("creative_asset_id", ids)
    .neq("status", "ARCHIVED");

  if (lookupError) throw lookupError;

  const byAsset = new Map(ids.map((id) => [id, []]));
  for (const node of nodes || []) {
    const id = String(node.creative_asset_id || "");
    if (byAsset.has(id)) byAsset.get(id).push(node);
  }

  const missing = ids.filter((id) => !byAsset.get(id)?.length);
  await materializeMissingSourceNodes({
    organization_id,
    creative_asset_ids: missing,
    byAsset,
  });

  const attached = [];
  for (const creativeAssetId of ids) {
    const candidates = byAsset.get(creativeAssetId) || [];
    const existing = candidates.find((node) =>
      String(node.creative_project_id || "") === String(creative_project_id),
    );
    if (existing) {
      attached.push(existing);
      continue;
    }

    const source = [...candidates]
      .sort((left, right) => sourceNodeRank(right) - sourceNodeRank(left))[0];
    if (!source) {
      throw new Error(`CREATIVE_SELECTED_ASSET_SOURCE_NODE_MISSING:${creativeAssetId}`);
    }

    attached.push(await create(projectReferenceNode({
      organization_id,
      creative_project_id,
      creative_asset_id: creativeAssetId,
      source,
    })));
  }

  return attached;
}

export async function listByProject({
  organization_id,
  creative_project_id,
}) {
  let query = supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .order("created_at", { ascending: false });

  if (creative_project_id) {
    query = query.eq("creative_project_id", creative_project_id);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}

export async function findReusable({
  organization_id,
  type,
  tags = [],
}) {
  let query = supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .eq("reuse->>approved_for_reuse", "true")
    .order("created_at", { ascending: false });

  if (type) {
    query = query.eq("type", type);
  }

  const { data, error } = await query;

  if (error) throw error;

  if (!tags.length) return data || [];

  return (data || []).filter((row) => {
    const rowTags = row?.intelligence?.tags || [];
    return tags.some((tag) => rowTags.includes(tag));
  });
}
