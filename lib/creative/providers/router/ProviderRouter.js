import {
  getProvidersForService,
} from "@/lib/platform/registry/providers/ProviderRegistry";

import {
  ProviderHealthRuntime,
} from "@/lib/platform/providers/runtime/ProviderHealthRuntime";

export const ProviderRouter = {

  chooseFallback,

  choose({

    capability,

    strategy = "cost_optimized",

    preferredProvider,

  }) {

    if (preferredProvider)
      return preferredProvider;

    const providers =
      getProvidersForService({

        requires: [
          capability,
        ],

      });

    if (!providers.length)
      throw new Error(
        `No provider for ${capability}`,
      );

    switch (strategy) {

      case "highest_quality":

        return providers.sort(

          (a,b)=>

            (b.quality_score||0)-
            (a.quality_score||0),

        )[0].id;

      case "fastest":

        return providers.sort(

          (a,b)=>

            (a.average_seconds||999999)-
            (b.average_seconds||999999),

        )[0].id;

      case "balanced":

        return providers.sort(

          (a,b)=>

            ((a.cost_score||0)+(a.average_seconds||0))-
            ((b.cost_score||0)+(b.average_seconds||0)),

        )[0].id;

      default:

        return providers.sort(

          (a,b)=>

            (a.cost_score||0)-
            (b.cost_score||0),

        )[0].id;

    }

  },

};


export function chooseFallback({

  capability,

  attempted = [],

}) {

  const providers =
    getProvidersForService({

      requires: [
        capability,
      ],

    });

  const health =
    ProviderHealthRuntime.list();

  const available =
    providers.filter(provider => {

      if (
        attempted.includes(
          provider.id,
        )
      )
        return false;

      const runtime =
        health.find(

          h =>
            h.id ===
            provider.id,

        );

      if (!runtime)
        return true;

      return runtime.online !== false;

    });

  if (!available.length)
    return null;

  return available[0].id;

}
