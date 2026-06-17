import {
  createServerSupabase,
} from "@/lib/shared/supabase/server";

export async function getAvailableModules({
  organizationId,
}) {

  if (!organizationId) {
    return [];
  }

  const supabase =
    createServerSupabase();

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
