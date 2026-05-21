import {
  getPlatformAreas,
} from "@/lib/platform/core/platformEngine";

import {
  getAccessibleDomains,
} from "@/lib/platform/governance/accessEngine";

import {
  getTenantModules,
} from "@/lib/platform/modules/getTenantModules";

export async function getPlatformRuntime({

  tenant,

  user,

}) {

  const enabledModules =

    await getTenantModules(
      tenant
    );

  const platformAreas =
    getPlatformAreas()

    .filter(
      area =>

        enabledModules.includes(
          area.id
        )
    );

  const runtimeAreas =

    platformAreas.map(
      area => ({

        ...area,

        domains:

          getAccessibleDomains({

            tenant,

            user,

            domains:
              area.domains,

          }),

      })
    );

  return {

    tenant,

    user,

    enabledModules,

    areas:
      runtimeAreas,

  };

}
