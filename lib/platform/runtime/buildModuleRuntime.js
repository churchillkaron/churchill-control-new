import {
  getAvailableModules,
} from "@/lib/platform/getAvailableModules";

export async function buildModuleRuntime({

  organizationId,

}) {

  const modules =
    await getAvailableModules({

          organizationId,

    });

  return {

    success: true,

    modules:
      modules || [],

  };

}
