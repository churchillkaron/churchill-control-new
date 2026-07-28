import {
  getServiceSupabase,
} from "@/lib/shared/supabase/service";

function text(value) {
  return String(value ?? "").trim();
}

export async function resolveOrganizationIndustries({
  organizationId,
} = {}) {
  const resolvedOrganizationId = text(organizationId);
  if (!resolvedOrganizationId) {
    throw new Error("organizationId required");
  }

  const supabase = getServiceSupabase();
  const {
    data: organization,
    error: organizationError,
  } = await supabase
    .from("organizations")
    .select("id")
    .eq("id", resolvedOrganizationId)
    .maybeSingle();

  if (organizationError) throw organizationError;
  if (!organization) throw new Error("Organization not found");

  const {
    data: industries,
    error: industryError,
  } = await supabase
    .from("organization_industries")
    .select("industry_id")
    .eq("organization_id", resolvedOrganizationId)
    .eq("status", "ACTIVE");

  if (industryError) throw industryError;

  return [
    ...new Set(
      (industries || [])
        .map((row) => text(row.industry_id))
        .filter(Boolean),
    ),
  ];
}
