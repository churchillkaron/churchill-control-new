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

const REQUIRED_PHYSICAL_COLUMNS = new Set([
  "id",
  "organization_id",
  "creative_project_id",
  "metadata",
]);

const SCHEMA_DEMOTED_COLUMNS = new Set([
  "creative_asset_id",
  "created_by",
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

function runtimeFields(metadata = {}) {
  return metadata?.runtime_fields &&
    typeof metadata.runtime_fields === "object"
    ? metadata.runtime_fields
    : {};
}

function normalizeRow(row = null) {
  if (!row) return row;

  const metadata = row.metadata || {};
  const hydrated = {
    ...row,
  };

  for (const [key, value] of Object.entries(runtimeFields(metadata))) {
    if (hydrated[key] == null) {
      hydrated[key] = value;
    }
  }

  return {
    ...hydrated,
    created_by:
      metadata.created_by ||
      hydrated.created_by ||
      null,
    cost: costContract(
      metadata.cost || hydrated.cost || {},
    ),
    reuse: reuseContract(
      metadata.reuse || hydrated.reuse || {},
    ),
  };
}

function normalizedValues(values = {}) {
  const normalized = {
    ...values,
  };

  const aliases = {
    organizationId: "organization_id",
    creativeProjectId: "creative_project_id",
    creativeAssetId: "creative_asset_id",
    productionTaskId: "production_task_id",
    parentAssetNodeId: "parent_asset_node_id",
    storagePath: "storage_path",
    createdBy: "created_by",
  };

  for (const [alias, canonical] of Object.entries(aliases)) {
    if (
      normalized[canonical] === undefined &&
      normalized[alias] !== undefined
    ) {
      normalized[canonical] = normalized[alias];
    }

    delete normalized[alias];
  }

  return normalized;
}

function storeRuntimeField(metadata, key, value) {
  return {
    ...metadata,
    runtime_fields: {
      ...runtimeFields(metadata),
      [key]: value,
    },
  };
}

function markSchemaDemotion(metadata, column) {
  const compatibility = metadata?.schema_compatibility || {};
  const demoted = new Set(
    Array.isArray(compatibility.demoted_columns)
      ? compatibility.demoted_columns
      : [],
  );

  demoted.add(column);

  return {
    ...metadata,
    schema_compatibility: {
      ...compatibility,
      mode: "DOMAIN_FIELDS_IN_METADATA",
      demoted_columns: [...demoted].sort(),
    },
  };
}

function demoteColumn(payload, column) {
  if (!Object.prototype.hasOwnProperty.call(payload, column)) {
    return payload;
  }

  const value = payload[column];
  const next = {
    ...payload,
  };

  delete next[column];

  next.metadata = markSchemaDemotion(
    storeRuntimeField(next.metadata || {}, column, value),
    column,
  );

  return next;
}

function applyKnownSchemaDemotions(payload = {}) {
  let next = {
    ...payload,
    metadata: {
      ...(payload.metadata || {}),
    },
  };

  for (const column of SCHEMA_DEMOTED_COLUMNS) {
    next = demoteColumn(next, column);
  }

  return next;
}

function missingSchemaColumn(error = null) {
  const message = String(error?.message || "");
  const match = message.match(
    /Could not find the '([^']+)' column of '[^']+' in the schema cache/i,
  );

  return match?.[1] || null;
}

async function persistCompatiblePayload({
  payload,
  id = null,
  update = false,
}) {
  let compatible = applyKnownSchemaDemotions(payload);
  const maximumAttempts = Math.max(
    1,
    Object.keys(compatible).length + 1,
  );

  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    let query = update
      ? supabaseAdmin
          .from(TABLE)
          .update(compatible)
          .eq("id", id)
      : supabaseAdmin
          .from(TABLE)
          .insert(compatible);

    const { data, error } = await query
      .select()
      .single();

    if (!error) {
      return data;
    }

    const missingColumn = missingSchemaColumn(error);

    if (
      !missingColumn ||
      REQUIRED_PHYSICAL_COLUMNS.has(missingColumn) ||
      !Object.prototype.hasOwnProperty.call(
        compatible,
        missingColumn,
      )
    ) {
      throw error;
    }

    SCHEMA_DEMOTED_COLUMNS.add(missingColumn);
    compatible = demoteColumn(
      compatible,
      missingColumn,
    );
  }

  throw new Error(
    "CREATIVE_ASSET_NODE_SCHEMA_COMPATIBILITY_EXHAUSTED",
  );
}

function sanitizePayload(
  values = {},
  {
    current = null,
    update = false,
  } = {},
) {
  const payload = {};
  let metadata = {
    ...(current?.metadata || {}),
    ...(values.metadata || {}),
  };

  for (const [key, value] of Object.entries(normalizedValues(values))) {
    if (value === undefined || key === "metadata") continue;

    if (key === "cost") {
      metadata.cost = costContract(value);
      continue;
    }

    if (key === "reuse") {
      metadata.reuse = reuseContract(value);
      continue;
    }

    if (key === "created_by") {
      metadata.created_by = value || null;
      continue;
    }

    if (PHYSICAL_COLUMNS.has(key)) {
      payload[key] = value;
      continue;
    }

    metadata = storeRuntimeField(
      metadata,
      key,
      value,
    );
  }

  payload.metadata = metadata;

  if (update) {
    delete payload.id;
    delete payload.created_at;
  }

  return payload;
}

export async function create(node = {}) {
  const data = await persistCompatiblePayload({
    payload: sanitizePayload(node),
  });

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

  const data = await persistCompatiblePayload({
    id,
    update: true,
    payload: {
      ...payload,
      updated_at: new Date().toISOString(),
    },
  });

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
