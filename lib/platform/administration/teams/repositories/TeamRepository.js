import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function normalizeId(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

export async function getTeams(organizationId) {
  const resolvedOrganizationId = normalizeId(organizationId);
  if (!resolvedOrganizationId) throw new Error("organizationId required");

  const { data, error } = await supabaseAdmin
    .from("teams")
    .select("*")
    .eq("organization_id", resolvedOrganizationId)
    .order("name");

  if (error) throw error;

  return data || [];
}

export async function createTeam(payload = {}) {
  const organizationId = normalizeId(payload.organization_id || payload.organizationId);
  if (!organizationId) throw new Error("organizationId required");

  const { data, error } = await supabaseAdmin
    .from("teams")
    .insert({
      ...payload,
      organization_id: organizationId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateTeam(id, organizationId, payload = {}) {
  const resolvedId = normalizeId(id);
  const resolvedOrganizationId = normalizeId(organizationId);

  if (!resolvedId) throw new Error("team id required");
  if (!resolvedOrganizationId) throw new Error("organizationId required");

  const { data, error } = await supabaseAdmin
    .from("teams")
    .update(payload)
    .eq("id", resolvedId)
    .eq("organization_id", resolvedOrganizationId)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Team not found");
  return data;
}

export async function archiveTeam(id, organizationId) {
  const resolvedId = normalizeId(id);
  const resolvedOrganizationId = normalizeId(organizationId);

  if (!resolvedId) throw new Error("team id required");
  if (!resolvedOrganizationId) throw new Error("organizationId required");

  const { data, error } = await supabaseAdmin
    .from("teams")
    .update({ status: "ARCHIVED" })
    .eq("id", resolvedId)
    .eq("organization_id", resolvedOrganizationId)
    .select("id")
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Team not found");
}
