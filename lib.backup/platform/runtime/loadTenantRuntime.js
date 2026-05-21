import {
  supabase,
} from "@/lib/shared/supabase/client";

export async function loadTenantRuntime(
  tenantId
) {

  if (!tenantId) {

    return null;

  }

  // TENANT

  const {
    data: tenant,
  } = await supabase

    .from("tenants")

    .select("*")

    .eq(
      "id",
      tenantId
    )

    .single();

  // MODULES

  const {
    data: modules,
  } = await supabase

    .from("tenant_modules")

    .select("*")

    .eq(
      "tenant_id",
      tenantId
    )

    .eq(
      "enabled",
      true
    );

  return {

    tenant,

    modules:
      modules || [],

  };

}
