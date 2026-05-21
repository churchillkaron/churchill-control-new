import { supabase }
  from "@/lib/supabase";

const ROUTE_MAP = {

  pos:
    "/pos",

  inventory:
    "/inventory",

  finance:
    "/finance",

  accounting:
    "/accounting",

  procurement:
    "/procurement",

  payroll:
    "/payroll",

  analytics:
    "/analytics",

  marketing_ai:
    "/marketing",

  owner_ai:
    "/intelligence",

  crm:
    "/crm",

  customer_portal:
    "/customer-portal",

  projects:
    "/projects",

  operations:
    "/operations",

};

export async function generateNavigation(
  tenantId
) {

  const {
    data,
    error,
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

  if (error)
    throw error;

  return data.map(
    module => ({

      id:
        module.module_id,

      name:
        module.module_name,

      route:

        ROUTE_MAP[
          module.module_id
        ] || "/",

    })
  );

}
