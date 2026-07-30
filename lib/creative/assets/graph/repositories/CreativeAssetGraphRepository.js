import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  createCreativeAssetNode,
  CREATIVE_ASSET_NODE_STATUS,
} from "../documents/CreativeAssetNode";

const TABLE = "creative_asset_nodes";

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
  if (missing.length) {
    throw new Error(`CREATIVE_SELECTED_ASSET_NODES_MISSING:${missing.join(",")}`);
  }

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
