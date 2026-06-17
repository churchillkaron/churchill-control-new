import { createOrganization } from "@/lib/organizations/createOrganization";
import { buildWorkspaceFromTemplate } from "@/lib/onboarding/buildWorkspaceFromTemplate";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getAvailableModules } from "@/lib/platform/getAvailableModules";

export async function provisionOrganization(payload) {
  const name = payload?.organization?.name;
  const industry = payload?.organization?.industry;
  const ownerEmail = payload?.owner?.email;
  const modules = payload?.modules || [];
  const tenantId = payload?.tenantId;

  const organization = await createOrganization({
    name,
    organizationType: "client_company",
    industry,
    tenantId,
  });

  if (!organization?.id) {
    return {
      success: false,
      error: "Organization creation failed",
    };
  }

  // LINK OWNER (SAFE)
  const { data: staffAccount } = await supabaseAdmin
    .from("staff_accounts")
    .select("id")
    .eq("email", ownerEmail)
    .maybeSingle();

  if (staffAccount?.id) {
    await supabaseAdmin
      .from("organization_users")
      .insert({
        organization_id: organization.id,
        staff_account_id: staffAccount.id,
        role: "OWNER",
        status: "active",
      });

    await supabaseAdmin
      .from("staff_accounts")
      .update({
        active_organization_id: organization.id,
      })
      .eq("id", staffAccount.id);
  }

  // MODULE BOOTSTRAP (CLEAN SINGLE SOURCE)
  const availableModules = await getAvailableModules({
    organizationId: organization.id,
    industry,
  });

  const moduleRows = (availableModules || []).map((m) => ({
    organization_id: organization.id,
    module_key: m.key,
    enabled: true,
  }));

  if (moduleRows.length) {
    await supabaseAdmin
      .from("organization_modules")
      .insert(moduleRows);
  }

  // WORKSPACE BOOTSTRAP
  const workspace = await buildWorkspaceFromTemplate({
    organizationId: organization.id,
    industry,
    installedBy: ownerEmail || "system",
  });

  return {
    success: true,
    organization,
    modules,
    workspace,
  };
}
