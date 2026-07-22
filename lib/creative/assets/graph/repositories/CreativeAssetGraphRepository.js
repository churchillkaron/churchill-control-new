import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_asset_nodes";

function reuseContract(value = {}) {
  return {
    reusable: value?.reusable ?? true,
    reuse_count: Number(value?.reuse_count || 0),
    approved_for_reuse: value?.approved_for_reuse === true,
  };
}

function normalizeRow(row = null) {
  if (!row) return row;

  return {
    ...row,
    reuse: reuseContract(
      row.metadata?.reuse || {},
    ),
  };
}

function sanitizePayload(values = {}, { update = false } = {}) {
  const payload = {
    ...values,
  };

  const reuse = Object.prototype.hasOwnProperty.call(payload, "reuse")
    ? reuseContract(payload.reuse)
    : null;

  if (reuse) {
    payload.metadata = {
      ...(payload.metadata || {}),
      reuse,
    };
  }

  delete payload.reuse;

  if (update) {
    delete payload.id;
    delete payload.created_at;
    delete payload.created_by;
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
  const payload = sanitizePayload(values, {
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
