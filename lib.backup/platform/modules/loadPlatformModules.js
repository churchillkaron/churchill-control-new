import {
  getTenantModules,
} from "./getTenantModules";

export async function loadPlatformModules(
  tenantId
) {

  const modules =
    await getTenantModules(
      tenantId
    );

  const grouped = {};

  modules.forEach(
    module => {

      if (
        !grouped[
          module.category
        ]
      ) {

        grouped[
          module.category
        ] = [];

      }

      grouped[
        module.category
      ].push(module);

    }
  );

  return grouped;

}
