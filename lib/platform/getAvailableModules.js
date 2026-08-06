import {
  createServerSupabase,
} from "@/lib/shared/supabase/server";

function isActiveStatus(status) {
  return (
    String(status || "")
      .trim()
      .toLowerCase() === "active"
  );
}

export async function getAvailableModules({
  organizationId,
  supabase: providedSupabase = null,
} = {}) {
  if (!organizationId) {
    return [];
  }

  const supabase =
    providedSupabase ||
    createServerSupabase();

  const {
    data: organizationModules,
    error,
  } = await supabase
    .from("organization_modules")
    .select("module_id, status")
    .eq(
      "organization_id",
      organizationId
    );

  if (error) {
    console.error(
      "organization_modules error:",
      error.message
    );

    return [];
  }

  const moduleIds = [
    ...new Set(
      (organizationModules || [])
        .filter(module =>
          isActiveStatus(module.status)
        )
        .map(module => module.module_id)
        .filter(Boolean)
    ),
  ];

  if (moduleIds.length === 0) {
    return [];
  }

  const {
    data: modules,
    error: moduleError,
  } = await supabase
    .from("platform_modules")
    .select("*")
    .in("id", moduleIds);

  if (moduleError) {
    console.error(
      "platform_modules error:",
      moduleError.message
    );

    return [];
  }

  const modulesById = new Map(
    (modules || []).map(module => [
      module.id,
      module,
    ])
  );

  return moduleIds
    .map(moduleId =>
      modulesById.get(moduleId)
    )
    .filter(Boolean);
}
