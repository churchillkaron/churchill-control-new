"use client";

import {
  usePlatform,
} from "@/app/providers/PlatformProvider";

import {
  PLATFORM_ROUTES,
} from "@/lib/shared/routing/platformRoutes";

export function usePlatformNavigation() {

  const runtime =
    usePlatform();

  const areas =

    runtime?.areas || [];

  return areas.map(
    area => ({

      ...area,

      route:

        PLATFORM_ROUTES[
          area.id
        ]?.route ||

        `/${area.id}`,

    })
  );

}
