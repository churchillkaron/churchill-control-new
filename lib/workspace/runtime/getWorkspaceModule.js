import {
  getWorkspaceModules,
} from "./getWorkspaceModules";

export async function getWorkspaceModule({
  tenantId,
  organizationId,
  moduleId,
  industry,
}) {

  const modules =
    await getWorkspaceModules({
      tenantId,
      organizationId,
      industry,
    });

  return (
    modules.find(
      (module) =>
        module.id === moduleId
    ) || null
  );

}
