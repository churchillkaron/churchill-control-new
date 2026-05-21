import { supabase }
  from "@/lib/supabase";

import {
  INDUSTRY_TEMPLATES,
} from "../industryTemplates";

export async function createIndustryTenant(
  data
) {

  const {

    tenant_id,

    industry_id,

    activated_by,

  } = data;

  const template =
    INDUSTRY_TEMPLATES.find(
      industry =>

        industry.id ===
        industry_id
    );

  if (!template) {

    throw new Error(
      "Industry template not found"
    );

  }

  const moduleRows =
    template.modules.map(
      module_id => ({

        tenant_id,

        module_id,

        module_name:
          module_id,

        status:
          "ACTIVE",

      })
    );

  const {
    error,
  } = await supabase

    .from(
      "tenant_modules"
    )

    .upsert(
      moduleRows
    );

  if (error)
    throw error;

  await supabase

    .from(
      "tenant_industries"
    )

    .upsert({

      tenant_id,

      industry_id,

      activated_by,

      created_at:
        new Date().toISOString(),

    });

  return {

    success: true,

    industry:
      template.name,

    modules:
      template.modules,

  };

}
