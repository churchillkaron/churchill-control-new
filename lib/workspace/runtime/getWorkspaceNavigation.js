import {
  getWorkspaceRuntime,
} from "./getWorkspaceRuntime";

export async function getWorkspaceNavigation({
  organizationId,
}) {

  const runtime =
    await getWorkspaceRuntime({
      organizationId,
    });

  if (!runtime) {

    return [];

  }

  return runtime.modules.map(
    (module) => ({

      id:
        module.id,

      name:
        module.name,

      category:
        module.category,

      route:
        module.runtimeRoute,

      icon:
        module.icon || null,

    })
  );

}
