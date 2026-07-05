import {
  listOrganizationServiceProviders,
} from "@/lib/platform/service-runtime/services/providers/OrganizationServiceProviderRepository";

import { WalletRuntime }
from "@/lib/platform/service-runtime/wallet/runtime/WalletRuntime";

export const ExecutionRuntime = {

  async execute({
    organization_id,
    category_id,
    service_id,
    provider_id,
    provider,
    capability,
    estimated_cost,
    operation,
    execute,
    metadata = {},
  }) {
    const resolvedProviderId =
      provider_id || provider;

    if (!organization_id) {
      throw new Error("organization_id required");
    }

    if (!service_id) {
      throw new Error("service_id required");
    }

    if (!resolvedProviderId) {
      throw new Error("provider_id required");
    }

    const providers =
      await listOrganizationServiceProviders({
        organization_id,
        service_id,
      });

    const connection =
      providers.find(
        row => row.provider_id === resolvedProviderId
      );

    if (!connection) {
      throw new Error(
        `${resolvedProviderId} is not configured for ${service_id}.`
      );
    }

    if (connection.status !== "connected") {
      throw new Error(
        `${resolvedProviderId} is not connected for ${service_id}.`
      );
    }

    await WalletRuntime.reserve({
      organization_id,
      amount: estimated_cost,
      provider: resolvedProviderId,
      reference: operation,
    });

    try {
      const result =
        await execute({
          connection,
          organization_service_provider: connection,
          metadata,
          capability,
          category_id,
          service_id,
          provider_id: resolvedProviderId,
        });

      await WalletRuntime.charge({
        organization_id,
        amount: estimated_cost,
        provider: resolvedProviderId,
        reference: operation,
      });

      return result;
    } catch (error) {
      await WalletRuntime.release({
        organization_id,
        amount: estimated_cost,
        provider: resolvedProviderId,
        reference: operation,
      });

      throw error;
    }
  },

};
