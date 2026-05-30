import {
  createServerSupabase,
} from "@/lib/shared/supabase/server";

export async function getAvailableModules({

  tenantId,

  organizationId,

}) {

  const supabase =
    createServerSupabase();

  // =====================================
  // ORGANIZATION GOVERNANCE
  // =====================================

  if (organizationId) {

    console.log(
      "GET MODULES FOR",
      organizationId
    );

    const {
      data: organizationModules,
      error,
    } = await supabase

      .from(
        "organization_modules"
      )

      .select("*")

      .eq(
        "organization_id",
        organizationId
      )

      .eq(
        "status",
        "ACTIVE"
      );

    console.log(
      "ORG MODULES RESULT",
      organizationModules
    );

    if (error) {

      console.error(
        "organization_modules error:",
        error.message
      );

      return [];

    }

    const moduleIds =

      (organizationModules || [])
        .map(
          module =>
            module.module_id
        );

    if (
      moduleIds.length === 0
    ) {

      return [];

    }

    const {
      data: modules,
      error: moduleError,
    } = await supabase

      .from(
        "platform_modules"
      )

      .select("*")

      .in(
        "id",
        moduleIds
      );

    if (moduleError) {

      console.error(
        "platform_modules error:",
        moduleError.message
      );

      return [];

    }

    return modules || [];

  }

  // =====================================
  // TENANT FALLBACK
  // =====================================

  if (!tenantId) {
    return [];
  }

  const {
    data: tenantModules,
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

  if (error) {

    console.error(
      "tenant_modules error:",
      error.message
    );

    return [];

  }

  const moduleIds =
    (tenantModules || [])
      .map(
        module =>
          module.module_id
      );

  if (
    moduleIds.length === 0
  ) {

    return [];

  }

  const {
    data: modules,
    error: moduleError,
  } = await supabase

    .from(
      "platform_modules"
    )

    .select("*")

    .in(
      "id",
      moduleIds
    );

  if (moduleError) {

    console.error(
      "platform_modules error:",
      moduleError.message
    );

    return [];

  }

  return modules || [];

}
