import { supabaseAdmin } from "@/lib/shared/supabase/admin";

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

  const found = new Set((nodes || []).map((node) => String(node.creative_asset_id)));
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length) {
    throw new Error(`CREATIVE_SELECTED_ASSET_NODES_MISSING:${missing.join(",")}`);
  }

  const attached = [];
  for (const node of nodes || []) {
    if (
      node.creative_project_id &&
      String(node.creative_project_id) !== String(creative_project_id)
    ) {
      throw new Error(`CREATIVE_ASSET_NODE_ALREADY_ASSIGNED:${node.id}`);
    }

    const metadata = {
      ...(node.metadata || {}),
      selected_for_project: true,
      selected_for_project_at: new Date().toISOString(),
    };
    attached.push(await update(node.id, {
      creative_project_id,
      metadata,
    }));
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
