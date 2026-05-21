import {
  getPlatformAreas,
} from "@/lib/platform/core/platformEngine";

import {
  getDuplicateDomains,
} from "@/lib/platform/core/platformEngine";

export function getDashboardData() {

  const areas =
    getPlatformAreas();

  const duplicates =
    getDuplicateDomains();

  const totalDomains =

    areas.reduce(
      (
        total,
        area
      ) =>

        total +
        area.domains.length,

      0
    );

  return {

    overview: {

      areas:
        areas.length,

      domains:
        totalDomains,

      duplicates:
        duplicates.length,

    },

    areas,

    duplicates,

  };

}
