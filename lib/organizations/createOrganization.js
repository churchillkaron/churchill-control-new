import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function createOrganization({
  name,
  organizationType,
  parentOrganizationId = null,
  legalName = null,
  industry = null,
  address = null,
  country = null,
  status = "active",
  organizationStatus = "ACTIVE",
}) {
  const normalizedName = String(name || "").trim();
  const normalizedOrganizationType = String(organizationType || "").trim();

  if (!normalizedName) {
    throw new Error("Organization name is required");
  }

  if (!normalizedOrganizationType) {
    throw new Error("organizationType is required");
  }

  const { data: org, error } = await supabaseAdmin
    .from("organizations")
    .insert({
      name: normalizedName,
      organization_type: normalizedOrganizationType,
      parent_organization_id: parentOrganizationId || null,
      legal_name: legalName || null,
      industry: industry || null,
      address: address || null,
      country: country || null,
      status: status || "active",
      organization_status: organizationStatus || "ACTIVE",
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return org;
}
