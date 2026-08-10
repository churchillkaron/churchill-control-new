import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function normalizeId(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

export async function getBusinessUnits(organizationId) {
  const resolvedOrganizationId = normalizeId(organizationId);
  if (!resolvedOrganizationId) throw new Error("organizationId required");

  const { data, error } = await supabaseAdmin
    .from("business_units")
    .select("*")
    .eq("organization_id", resolvedOrganizationId)
    .order("name");

  if (error) throw error;

  return data || [];
}

export async function createBusinessUnit(payload = {}) {
  const organizationId = normalizeId(
    payload.organization_id || payload.organizationId,
  );

  if (!organizationId) throw new Error("organizationId required");

  const { data, error } = await supabaseAdmin
    .from("business_units")
    .insert({
      ...payload,
      organization_id: organizationId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateBusinessUnit(id, organizationId, payload = {}) {
  const resolvedId = normalizeId(id);
  const resolvedOrganizationId = normalizeId(organizationId);

  if (!resolvedId) throw new Error("business unit id required");
  if (!resolvedOrganizationId) throw new Error("organizationId required");

  const { data, error } = await supabaseAdmin
    .from("business_units")
    .update(payload)
    .eq("id", resolvedId)
    .eq("organization_id", resolvedOrganizationId)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Business unit not found");
  return data;
}

export async function archiveBusinessUnit(id, organizationId) {
  const resolvedId = normalizeId(id);
  const resolvedOrganizationId = normalizeId(organizationId);

  if (!resolvedId) throw new Error("business unit id required");
  if (!resolvedOrganizationId) throw new Error("organizationId required");

  const { data, error } = await supabaseAdmin
    .from("business_units")
    .update({ status: "ARCHIVED" })
    .eq("id", resolvedId)
    .eq("organization_id", resolvedOrganizationId)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Business unit not found");
}
