import {
  SYSTEM_REGISTRY,
} from "@/lib/shared/architecture/systemRegistry";

import {
  PLATFORM_ROUTES,
} from "@/lib/shared/routing/platformRoutes";

export function getPlatformAreas() {

  return Object.entries(
    SYSTEM_REGISTRY
  ).map(
    ([key, value]) => ({

      id: key,

      title:
        value.title,

      owner:
        value.owner,

      status:
        value.status,

      route:
        PLATFORM_ROUTES[
          key
        ]?.route ||

        `/${key}`,

      domains:
        value.domains,

    })
  );

}

export function getPlatformArea(
  areaId
) {

  return getPlatformAreas()
    .find(
      area =>

        area.id ===
        areaId
    );

}

export function getAllDomains() {

  return Object.values(
    SYSTEM_REGISTRY
  ).flatMap(
    area =>

      area.domains
  );

}

export function getActiveDomains() {

  return getAllDomains()

    .filter(
      domain =>

        domain.keep
    );

}

export function getDuplicateDomains() {

  return getAllDomains()

    .filter(
      domain =>

        domain.status ===
        "DUPLICATE"
    );

}
