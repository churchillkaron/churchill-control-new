import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function createOrganization({
  name,
  organizationType,
  industry = null,
  parentOrganizationId = null,
  tenantId,
  templateId,
}) {
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .insert({
      name,
      organization_type: organizationType,
      industry,
      parent_organization_id: parentOrganizationId,
      tenant_id: tenantId,
      status: "active",
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}
