import {
  resolveProvider,
} from "../providers/ProviderResolver";

import {
  executeProvider,
} from "../providers/ProviderExecutor";

import {
  PricingRuntime,
} from "../pricing/PricingRuntime";

import {
  WalletRuntime,
} from "../wallet/runtime/WalletRuntime";

import {
  UsageRuntime,
} from "../usage/UsageRuntime";


export async function executeService(input = {}) {

  const {

    organization_id,

    service_id,

    provider_id,

    input: payload = {},

    metadata = {},

    category = "SERVICE",

  } = input;


  if (!organization_id) {

    throw new Error(
      "organization_id required"
    );

  }


  if (!service_id) {

    throw new Error(
      "service_id required"
    );

  }


  const selectedProvider =
    await resolveProvider({

      capability:
        service_id,

      preferredProvider:
        provider_id,

    });


  const provider =
    selectedProvider.provider;


  const model =
    selectedProvider.model;


  const pricing =
    await PricingRuntime.resolve({

      provider,

      model,

      capability:
        service_id,

    });


  await WalletRuntime.reserve({

    organization_id,

    amount:
      pricing.customer_price,

    provider,

    reference:
      service_id,

  });


  try {


    const result =
      await executeProvider({

        provider,

        capability:
          service_id,

        model,

        input:
          payload,

        context:{

          organization_id,

          country:
            input.country ||
            null,

          currency:
            pricing.currency ||
            null,

        },

      });



    const usage =
      await UsageRuntime.record({

        organization_id,

        category,

        provider,

        capability:
          service_id,

        operation:
          service_id,

        supplier_cost:
          pricing.supplier_cost,

        platform_markup:
          pricing.platform_markup,

        customer_price:
          pricing.customer_price,

        metadata:{

          ...metadata,

          model,

          result,

        },

      });



    await WalletRuntime.charge({

      organization_id,

      amount:
        pricing.customer_price,

      provider,

      usage_id:
        usage.id,

      reference:
        service_id,

    });



    return {

      success:true,

      provider,

      model,

      pricing,

      usage,

      output:
        result,

    };


  } catch(error) {


    await WalletRuntime.release({

      organization_id,

      amount:
        pricing.customer_price,

      provider,

      reference:
        service_id,

    });


    throw error;

  }


}


export const ServiceExecutionRuntime = {

  execute:
    executeService,

};
