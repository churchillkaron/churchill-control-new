import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_asset_nodes";

const PHYSICAL_COLUMNS = new Set([
  "id",
  "organization_id",
  "creative_project_id",
  "creative_asset_id",
  "production_task_id",
  "parent_asset_node_id",
  "type",
  "status",
  "name",
  "description",
  "url",
  "storage_path",
  "lineage",
  "technical",
  "intelligence",
  "review",
  "metadata",
  "created_at",
  "updated_at",
]);

function reuseContract(value = {}) {
  return {
    reusable: value?.reusable ?? true,
    reuse_count: Number(value?.reuse_count || 0),
    approved_for_reuse:
      value?.approved_for_reuse === true,
  };
}

function costContract(value = {}) {
  return {
    currency: value?.currency || null,
    estimated: Number(value?.estimated || 0),
    actual: Number(value?.actual || 0),
    saved_by_reuse: Number(value?.saved_by_reuse || 0),
  };
}

function normalizeRow(row = null) {
  if (!row) return row;

  return {
    ...row,
    created_by:
      row.metadata?.created_by ||
      row.metadata?.runtime_fields?.created_by ||
      null,
    cost: costContract(
      row.metadata?.cost || {},
    ),
    reuse: reuseContract(
      row.metadata?.reuse || {},
    ),
  };
}

function sanitizePayload(
  values = {},
  {
    current = null,
    update = false,
  } = {},
) {
  const payload = {};
  const metadata = {
    ...(current?.metadata || {}),
    ...(values.metadata || {}),
  };

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || key === "metadata") continue;

    if (key === "cost") {
      metadata.cost = costContract(value);
      continue;
    }

    if (key === "reuse") {
      metadata.reuse = reuseContract(value);
      continue;
    }

    if (key === "created_by" || key === "createdBy") {
      metadata.created_by = value || null;
      continue;
    }

    if (PHYSICAL_COLUMNS.has(key)) {
      payload[key] = value;
      continue;
    }

    metadata.runtime_fields = {
      ...(metadata.runtime_fields || {}),
      [key]: value,
    };
  }

  payload.metadata = metadata;

  delete payload.organizationId;
  delete payload.creativeProjectId;
  delete payload.creativeAssetId;
  delete payload.productionTaskId;
  delete payload.parentAssetNodeId;
  delete payload.storagePath;
  delete payload.createdBy;
  delete payload.created_by;

  if (update) {
    delete payload.id;
    delete payload.created_at;
  }

  return payload;
}

export async function create(node = {}) {
  const payload = sanitizePayload(node);

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return normalizeRow(data);
}

export async function update(id, values = {}) {
  const current = await get(id);

  if (!current) {
    throw new Error("CREATIVE_ASSET_NODE_NOT_FOUND");
  }

  const payload = sanitizePayload(values, {
    current,
    update: true,
  });

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return normalizeRow(data);
}

export async function get(id) {
  if (!id) return null;

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return normalizeRow(data || null);
}

export async function listByProject({
  organization_id,
  creative_project_id,
}) {
  if (!organization_id) {
    throw new Error("organization_id required");
  }

  let query = supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .order("created_at", { ascending: false });

  if (creative_project_id) {
    query = query.eq(
      "creative_project_id",
      creative_project_id,
    );
  }

  const { data, error } = await query;

  if (error) throw error;
  return (data || []).map(normalizeRow);
}

export async function findReusable({
  organization_id,
  type,
  tags = [],
}) {
  if (!organization_id) {
    throw new Error("organization_id required");
  }

  let query = supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .order("created_at", { ascending: false });

  if (type) {
    query = query.eq("type", type);
  }

  const { data, error } = await query;

  if (error) throw error;

  const reusable = (data || [])
    .map(normalizeRow)
    .filter((row) =>
      row.reuse?.reusable === true &&
      row.reuse?.approved_for_reuse === true,
    );

  if (!tags.length) return reusable;

  return reusable.filter((row) => {
    const rowTags = Array.isArray(row?.intelligence?.tags)
      ? row.intelligence.tags
      : [];

    return tags.some((tag) => rowTags.includes(tag));
  });
}
