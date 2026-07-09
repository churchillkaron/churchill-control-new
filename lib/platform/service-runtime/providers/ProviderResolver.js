import {
  getProvidersForCapability,
} from "./ProviderRegistry.js";

import {
  listProviderPricing,
} from "../pricing/repositories/ProviderPricingRepository.js";


export function resolveProviders({

  capability,

  country = null,

}) {


  if (!capability) {

    throw new Error(
      "capability required"
    );

  }


  return getProvidersForCapability(
    capability
  )
  .filter(provider => {

    if (
      !country ||
      !provider.countries
    ) {
      return true;
    }


    return (
      provider.countries.includes("*") ||
      provider.countries.includes(country)
    );

  });

}



export async function resolveProvider({

  capability,

  country = null,

  currency = null,

  preferredProvider = null,

}) {


  const providers =
    resolveProviders({

      capability,

      country,

    });



  if (!providers.length) {

    throw new Error(
      `No providers for ${capability}`
    );

  }



  const candidates = [];



  for (const provider of providers) {


    if (
      preferredProvider &&
      provider.id !== preferredProvider
    ) {

      continue;

    }



    const pricing =
      await listProviderPricing({

        provider:
          provider.id,

        capability,

        country,

        currency,

      });



    for (const price of pricing) {


      candidates.push({

        provider:
          provider.id,


        model:
          price.model || null,


        capability,


        country:
          price.country || country,


        currency:
          price.currency || currency,


        unit:
          price.unit || null,


        markup:
          price.markup_percent || 0,


        input_cost:
          price.input_cost_per_1m || 0,


        output_cost:
          price.output_cost_per_1m || 0,


        cost_per_unit:
          price.cost_per_unit || 0,


      });


    }

  }



  if (!candidates.length) {

    throw new Error(
      `No priced provider available for ${capability}`
    );

  }



  /*
    Future selection strategy:

    - customer plan
    - country
    - currency
    - cost
    - latency
    - provider quality
    - availability

  */


  candidates.sort(
    (a,b)=>{

      const aCost =
        Number(a.cost_per_unit || 0) +
        Number(a.input_cost || 0) +
        Number(a.output_cost || 0);


      const bCost =
        Number(b.cost_per_unit || 0) +
        Number(b.input_cost || 0) +
        Number(b.output_cost || 0);


      return aCost - bCost;

    }
  );



  return candidates[0];

}



export const ProviderResolver = {

  resolveProviders,

  resolveProvider,

};
