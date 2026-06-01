import {
  getAvailableModules,
} from "@/lib/platform/getAvailableModules";

export async function getWorkspaceModules({
  tenantId,
  organizationId,
  industry,
}) {

  const modules =
    await getAvailableModules({
      tenantId,
      organizationId,
    });

  return (
    modules || []
  ).map(
    (module) => ({
      ...module,

      runtimeRoute:
        `/workspace/${organizationId}/${module.id}`,

      industry:
        industry || null,
    })
  );

}
