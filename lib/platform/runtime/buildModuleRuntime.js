import {
  getAvailableModules,
} from "@/lib/platform/getAvailableModules";

export async function buildModuleRuntime({

  tenantId,

  organizationId,

}) {

  const modules =
    await getAvailableModules({

      tenantId,

      organizationId,

    });

  return {

    success: true,

    modules:
      modules || [],

  };

}
