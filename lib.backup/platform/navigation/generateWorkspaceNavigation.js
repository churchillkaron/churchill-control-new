import { supabase }
  from "@/lib/supabase";

import {
  INDUSTRY_REGISTRY,
  getIndustryById,
} from "../industryRegistry";

export async function generateWorkspaceNavigation(
  tenantId
) {

  // SUPER ADMIN CHECK

  const {
    data: staff,
  } = await supabase

    .from(
      "staff_accounts"
    )

    .select("*")

    .eq(
      "tenant_id",
      tenantId
    )

    .limit(1)
    .single();

  const isSuperAdmin =

    staff?.role ===
    "SUPER_ADMIN";

  // INDUSTRY

  const {
    data: industryRow,
  } = await supabase

    .from(
      "tenant_industries"
    )

    .select("*")

    .eq(
      "tenant_id",
      tenantId
    )

    .single();

  const industry =
    getIndustryById(
      industryRow?.industry_id
    );

  // MODULES

  const {
    data: modules,
  } = await supabase

    .from(
      "tenant_modules"
    )

    .select("*")

    .eq(
      "tenant_id",
      tenantId
    )

    .eq(
      "status",
      "ACTIVE"
    );

  // OWNER MODE

  if (
    isSuperAdmin
  ) {

    const allWorkspaces =
      INDUSTRY_REGISTRY.flatMap(
        industry =>

          industry.workspaces
      );

    const {
      data: allModules,
    } = await supabase

      .from(
        "platform_modules"
      )

      .select("*")

      .eq(
        "status",
        "active"
      );

    return {

      superAdmin:
        true,

      industry,

      workspaces:
        allWorkspaces,

      modules:
        allModules || [],

    };

  }

  // NORMAL TENANT

  return {

    superAdmin:
      false,

    industry,

    workspaces:
      industry?.workspaces || [],

    modules:
      modules || [],

  };

}
