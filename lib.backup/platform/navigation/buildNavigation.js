import {
  buildPlatformNavigation,
} from "@/lib/navigation/buildPlatformNavigation";

import {
  loadPlatformModules,
} from "../modules/loadPlatformModules";

export async function buildNavigation(
  tenantId
) {

  const navigation =
    buildPlatformNavigation();

  const tenantModules =
    await loadPlatformModules(
      tenantId
    );

  Object.keys(
    navigation
  ).forEach(group => {

    navigation[group] =
      navigation[group].filter(
        item => {

          const activeModules =
            tenantModules[group] || [];

          return activeModules.some(
            module =>

              module.route === item.route ||

              module.name === item.name
          );

        }
      );

  });

  return navigation;

}
