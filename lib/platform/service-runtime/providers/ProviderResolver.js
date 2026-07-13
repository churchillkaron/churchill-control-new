import {
  getProvidersForCapability,
} from "./ProviderRegistry.js";

import {
  listProviderPricing,
} from "../pricing/repositories/ProviderPricingRepository.js";

import {
  selectBestProvider,
} from "./ProviderIntelligenceResolver.js";


export async function resolveProviders({

  capability,

}) {

  if (!capability) {

    throw new Error(
      "capability required"
    );

  }


  return getProvidersForCapability(
    capability
  );

}



export async function resolveProvider({

  organization_id,

  capability,

  country = null,

  currency = null,

}) {


  if (!organization_id) {

    throw new Error(
      "organization_id required"
    );

  }


  const providers =
    await resolveProviders({

      capability,

    });



  const candidates =
    [];



  for (
    const provider
    of providers
  ) {


    const pricing =
      await listProviderPricing({

        provider:
          provider.id,

        capability,

        country,

        currency,

      });



    for (
      const price
      of pricing
    ) {


      candidates.push({

        provider:
          provider.id,

        model:
          price.model || null,


        capability,


        currency:
          price.currency ||
          currency,


        cost_per_unit:
          price.cost_per_unit || 0,


        input_cost:
          price.input_cost_per_1m || 0,


        output_cost:
          price.output_cost_per_1m || 0,


        quality_score:
          provider.quality_score ||
          80,


        speed_score:
          provider.speed_score ||
          80,


        cost_score:
          provider.cost_score ||
          80,


        metadata:{
          provider_name:
            provider.name,
        },

      });

    }

  }



  if (!candidates.length) {

    throw new Error(
      `No available provider for ${capability}`
    );

  }



  const selected =
    selectBestProvider(
      candidates
    );


  if (!selected) {

    throw new Error(
      `Provider selection failed for ${capability}`
    );

  }



  return selected;

}



export const ProviderResolver = {

  resolveProviders,

  resolveProvider,

};
