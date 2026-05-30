import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import {
  applyWorkspaceTemplate,
} from "@/lib/platform/templates/applyWorkspaceTemplate";

export async function createOrganization({

  name,

  organizationType,

  parentOrganizationId = null,

  tenantId,

  templateId,

}) {

  const organization =
    await supabaseAdmin
      .from("organizations")
      .insert({

        name,

        organization_type:
          organizationType,

        parent_organization_id:
          parentOrganizationId,

        tenant_id:
          tenantId,

        status:
          "active",

      })
      .select()
      .single();

  if (organization.error) {
    throw organization.error;
  }

  if (templateId) {

    await applyWorkspaceTemplate({

      organizationId:
        organization.data.id,

      templateId,

    });

  }

  return organization.data;

}
