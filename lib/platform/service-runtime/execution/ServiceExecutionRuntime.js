import {
  OrganizationServiceRuntime,
} from "../services/runtime/OrganizationServiceRuntime";

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

import {
  BillingRuntime,
} from "../billing/runtime/BillingRuntime";

import {
  resolveServiceCapabilities,
} from "../services/resolver/ServiceCapabilityResolver";

import {
  resolvePrimaryExecutionCapability,
} from "../services/resolver/CapabilityExecutionResolver";

export async function executeService(input = {}) {

  const {

    organization_id,

    party_id = null,

    entity_id = null,

    service_id,

    provider_id,

    input: payload = {},

    metadata = {},

    category = "SERVICE",

  } = input;

  if (!organization_id) {
    throw new Error("organization_id required");
  }

  if (!service_id) {
    throw new Error("service_id required");
  }

  const organizationService =
    await OrganizationServiceRuntime.get({

      organization_id,

      service_id,

    });

  if (!organizationService) {

    throw new Error(
      `Service ${service_id} is not enabled for organization`
    );

  }


  const serviceCapabilities =
    resolveServiceCapabilities(
      service_id
    );


  if (!serviceCapabilities) {

    throw new Error(
      `No capability mapping found for service ${service_id}`
    );

  }


  if (
    !serviceCapabilities.capabilities ||
    serviceCapabilities.capabilities.length === 0
  ) {

    throw new Error(
      `Service ${service_id} has no enabled capabilities`
    );

  }



  const executionCapability =
    resolvePrimaryExecutionCapability(
      serviceCapabilities.capabilities
    );


  if (!executionCapability) {

    throw new Error(
      `No execution capability found for ${service_id}`
    );

  }


  const selectedProvider =
    await resolveProvider({

      capability:
        executionCapability,

      preferredProvider:
        provider_id,

      country:
        input.country || null,

      currency:
        input.currency || null,

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
        executionCapability,

      country:
        input.country || null,

      currency:
        input.currency || null,

    });

  const usage =
    await UsageRuntime.start({

      organization_id,

      bill_to_organization_id:
        input.bill_to_organization_id ||
        organization_id,

      party_id,

      entity_id,

      organization_service_id:
        organizationService.id,

      pricing_id:
        pricing.pricing_id,

      category,

      provider,

      capability:
        executionCapability,

      operation:
        executionCapability,

      currency:
        pricing.currency,

      quantity:
        input.quantity || 1,

      unit:
        pricing.unit || "request",

      metadata: {

        ...metadata,

        model,

      },

    });

  await WalletRuntime.reserve({

    organization_id,

    amount:
      pricing.customer_price,

    provider,

    reference:
      usage.id,

  });

  const startedAt =
    Date.now();

  try {

    const result =
      await executeProvider({

        provider,

        capability:
          executionCapability,

        model,

        input:
          payload,

        context:{

          organization_id,

          party_id,

          entity_id,

          credential_id:
            selectedProvider.credential_id ||
            null,

          organization_service_id:
            organizationService.id,

          credential_id:
            selectedProvider.credential_id ||
            null,

          country:
            input.country || null,

          currency:
            pricing.currency,

        },

      });

    const completedUsage =
      await UsageRuntime.complete({

        usage_id:
          usage.id,

        supplier_cost:
          pricing.supplier_cost,

        platform_markup:
          pricing.platform_markup,

        customer_price:
          pricing.customer_price,

        quantity:
          input.quantity || 1,

        unit:
          pricing.unit || "request",

        latency_ms:
          Date.now() - startedAt,

        metadata: {

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
        completedUsage.id,

      reference:
        completedUsage.id,

    });

    const billing =
      await BillingRuntime.billUsage({

        usage_id:
          completedUsage.id,

      });

    return {

      success:true,

      provider,

      model,

      pricing,

      usage:
        billing.usage,

      billing,

      output:
        result,

    };

  } catch(error) {

    await UsageRuntime.fail({

      usage_id:
        usage.id,

      error,

      latency_ms:
        Date.now() - startedAt,

      metadata,

    }).catch(() => null);

    await WalletRuntime.release({

      organization_id,

      amount:
        pricing.customer_price,

      provider,

      reference:
        usage.id,

    });

    throw error;

  }

}

export const ServiceExecutionRuntime = {

  execute:
    executeService,

};
