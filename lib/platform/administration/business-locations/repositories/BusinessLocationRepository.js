import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function normalizeId(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

export async function getBusinessLocations(organizationId) {
  const resolvedOrganizationId = normalizeId(organizationId);
  if (!resolvedOrganizationId) throw new Error("organizationId required");

  const { data, error } = await supabaseAdmin
    .from("business_locations")
    .select("*")
    .eq("organization_id", resolvedOrganizationId)
    .order("name");

  if (error) throw error;

  return data || [];
}

export async function createBusinessLocation(payload = {}) {
  const organizationId = normalizeId(payload.organization_id || payload.organizationId);
  if (!organizationId) throw new Error("organizationId required");

  const { data, error } = await supabaseAdmin
    .from("business_locations")
    .insert({
      ...payload,
      organization_id: organizationId,
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function updateBusinessLocation(id, organizationId, payload = {}) {
  const resolvedId = normalizeId(id);
  const resolvedOrganizationId = normalizeId(organizationId);

  if (!resolvedId) throw new Error("business location id required");
  if (!resolvedOrganizationId) throw new Error("organizationId required");

  const { data, error } = await supabaseAdmin
    .from("business_locations")
    .update(payload)
    .eq("id", resolvedId)
    .eq("organization_id", resolvedOrganizationId)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Business location not found");

  return data;
}

export async function archiveBusinessLocation(id, organizationId) {
  const resolvedId = normalizeId(id);
  const resolvedOrganizationId = normalizeId(organizationId);

  if (!resolvedId) throw new Error("business location id required");
  if (!resolvedOrganizationId) throw new Error("organizationId required");

  const { data, error } = await supabaseAdmin
    .from("business_locations")
    .update({
      status: "ARCHIVED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", resolvedId)
    .eq("organization_id", resolvedOrganizationId)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Business location not found");
}
