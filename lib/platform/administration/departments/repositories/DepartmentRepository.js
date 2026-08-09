import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function normalizeId(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function isActive(row = {}) {
  if (row.active === false || row.is_active === false || row.enabled === false) {
    return false;
  }

  const status = String(row.status || "ACTIVE").trim().toUpperCase();
  return !["INACTIVE", "DISABLED", "ARCHIVED"].includes(status);
}

export async function getDepartments(organizationOrOptions, maybeEntityId = null) {
  const options =
    organizationOrOptions && typeof organizationOrOptions === "object"
      ? organizationOrOptions
      : {
          organizationId: organizationOrOptions,
          entityId: maybeEntityId,
        };

  const organizationId = normalizeId(
    options.organizationId || options.organization_id
  );
  const entityId = normalizeId(options.entityId || options.entity_id);

  if (!organizationId) throw new Error("organizationId required");

  let query = supabaseAdmin
    .from("departments")
    .select("*")
    .eq("organization_id", organizationId);

  if (entityId) query = query.eq("entity_id", entityId);

  const { data, error } = await query.order("name", { ascending: true });

  if (error) throw error;
  return (data || []).filter(isActive);
}

export async function createDepartment(payload = {}) {
  const organizationId = normalizeId(payload.organization_id || payload.organizationId);
  if (!organizationId) throw new Error("organizationId required");

  const { data, error } = await supabaseAdmin
    .from("departments")
    .insert({
      ...payload,
      organization_id: organizationId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateDepartment(id, organizationId, payload = {}) {
  const resolvedId = normalizeId(id);
  const resolvedOrganizationId = normalizeId(organizationId);

  if (!resolvedId) throw new Error("department id required");
  if (!resolvedOrganizationId) throw new Error("organizationId required");

  const { data, error } = await supabaseAdmin
    .from("departments")
    .update(payload)
    .eq("id", resolvedId)
    .eq("organization_id", resolvedOrganizationId)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Department not found");
  return data;
}

export async function archiveDepartment(id, organizationId) {
  const resolvedId = normalizeId(id);
  const resolvedOrganizationId = normalizeId(organizationId);

  if (!resolvedId) throw new Error("department id required");
  if (!resolvedOrganizationId) throw new Error("organizationId required");

  const { data, error } = await supabaseAdmin
    .from("departments")
    .update({
      status: "ARCHIVED",
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", resolvedId)
    .eq("organization_id", resolvedOrganizationId)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Department not found");
}
