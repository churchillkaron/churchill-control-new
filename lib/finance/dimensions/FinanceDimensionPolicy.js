import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const VALUE_TYPES = new Set(["LIST", "TEXT", "NUMBER", "DATE", "BOOLEAN"]);
const SCOPES = new Set(["ENTITY", "ORGANISATION"]);

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function upper(value) {
  return text(value)?.toUpperCase() || null;
}

function date(value) {
  const normalized = text(value);
  if (!normalized) return null;
  const match = normalized.match(/^\d{4}-\d{2}-\d{2}/);
  if (!match) throw new Error("A valid date is required");
  return match[0];
}

function code(value, label) {
  const normalized = upper(value);
  if (!normalized) throw new Error(`${label} required`);
  if (!/^[A-Z0-9][A-Z0-9._/-]{0,31}$/.test(normalized)) {
    throw new Error(`${label} must use 1-32 letters, numbers, dot, dash, slash or underscore`);
  }
  return normalized;
}

async function requireEntity({ organizationId, entityId }) {
  if (!entityId) return null;
  const { data, error } = await supabaseAdmin
    .from("legal_entities")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", entityId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Legal Entity is outside organisation scope");
  return data;
}

export async function upsertFinanceDimension({ organizationId, payload = {}, actorId }) {
  if (!organizationId) throw new Error("organizationId required");

  const id = text(payload.id || payload.dimension_id);
  const scope = upper(payload.scope || "ENTITY");
  const valueType = upper(payload.value_type || "LIST");
  const entityId = text(payload.entity_id || payload.entityId);
  const effectiveFrom = date(payload.effective_from);
  const effectiveTo = date(payload.effective_to);

  if (!SCOPES.has(scope)) throw new Error("Select a supported Dimension Scope");
  if (!VALUE_TYPES.has(valueType)) throw new Error("Select a supported Dimension Value Type");
  if (scope === "ENTITY" && !entityId) throw new Error("Legal Entity required for entity-scoped Dimensions");
  if (scope === "ORGANISATION" && entityId) throw new Error("Organisation-scoped Dimensions cannot have a Legal Entity");
  if (!effectiveFrom) throw new Error("Effective From required");
  if (effectiveTo && effectiveTo < effectiveFrom) throw new Error("Effective To cannot be before Effective From");
  await requireEntity({ organizationId, entityId });

  const record = {
    organization_id: organizationId,
    entity_id: entityId,
    code: code(payload.code, "Dimension Code"),
    name: text(payload.name),
    description: text(payload.description),
    scope,
    value_type: valueType,
    allow_hierarchy: Boolean(payload.allow_hierarchy),
    required_on_posting: Boolean(payload.required_on_posting),
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    is_active: payload.is_active !== false,
    updated_by: actorId || null,
    updated_at: new Date().toISOString(),
  };
  if (!record.name) throw new Error("Dimension Name required");

  const query = id
    ? supabaseAdmin.from("finance_dimensions").update(record).eq("organization_id", organizationId).eq("id", id)
    : supabaseAdmin.from("finance_dimensions").insert({ ...record, created_by: actorId || null });
  const { data, error } = await query.select().single();
  if (error) throw error;
  return { success: true, dimension: data };
}

export async function upsertFinanceDimensionValue({ organizationId, payload = {}, actorId }) {
  if (!organizationId) throw new Error("organizationId required");

  const id = text(payload.id || payload.dimension_value_id);
  const dimensionId = text(payload.dimension_id);
  if (!dimensionId) throw new Error("Dimension required");

  const { data: dimension, error: dimensionError } = await supabaseAdmin
    .from("finance_dimensions")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", dimensionId)
    .maybeSingle();
  if (dimensionError) throw dimensionError;
  if (!dimension) throw new Error("Dimension not found");
  if (upper(dimension.value_type) !== "LIST") {
    throw new Error("Only Controlled List Dimensions can have stored values");
  }

  const entityId = text(payload.entity_id || payload.entityId || dimension.entity_id);
  if (dimension.scope === "ENTITY" && String(entityId || "") !== String(dimension.entity_id || "")) {
    throw new Error("Dimension Value belongs to the wrong Legal Entity");
  }

  const effectiveFrom = date(payload.effective_from);
  const effectiveTo = date(payload.effective_to);
  if (!effectiveFrom) throw new Error("Effective From required");
  if (effectiveTo && effectiveTo < effectiveFrom) throw new Error("Effective To cannot be before Effective From");

  const parentValueId = text(payload.parent_value_id);
  if (parentValueId && !dimension.allow_hierarchy) {
    throw new Error("This Dimension does not allow hierarchy");
  }
  if (id && parentValueId === id) throw new Error("A Dimension Value cannot be its own parent");

  const record = {
    organization_id: organizationId,
    entity_id: entityId,
    dimension_id: dimensionId,
    code: code(payload.code, "Value Code"),
    name: text(payload.name),
    description: text(payload.description),
    parent_value_id: parentValueId,
    effective_from: effectiveFrom,
    effective_to: effectiveTo,
    is_active: payload.is_active !== false,
    updated_by: actorId || null,
    updated_at: new Date().toISOString(),
  };
  if (!record.name) throw new Error("Value Name required");

  const query = id
    ? supabaseAdmin.from("finance_dimension_values").update(record).eq("organization_id", organizationId).eq("id", id)
    : supabaseAdmin.from("finance_dimension_values").insert({ ...record, created_by: actorId || null });
  const { data, error } = await query.select().single();
  if (error) throw error;
  return { success: true, dimensionValue: data };
}

export async function listFinanceDimensions({ organizationId, entityId }) {
  if (!organizationId) throw new Error("organizationId required");
  let query = supabaseAdmin
    .from("finance_dimensions")
    .select("*")
    .eq("organization_id", organizationId)
    .order("code", { ascending: true });
  if (entityId) query = query.or(`entity_id.eq.${entityId},entity_id.is.null`);
  const dimensions = await query;
  if (dimensions.error) throw dimensions.error;

  const values = await supabaseAdmin
    .from("finance_dimension_values")
    .select("*")
    .eq("organization_id", organizationId)
    .order("code", { ascending: true });
  if (values.error) throw values.error;

  return {
    dimensions: dimensions.data || [],
    values: values.data || [],
  };
}
