import { IntegrationConnectionRepository }
from "@/lib/platform/service-runtime/integrations/repositories/IntegrationConnectionRepository";

import { WalletRuntime }
from "@/lib/platform/service-runtime/wallet/runtime/WalletRuntime";

export const ExecutionRuntime = {

  async execute({

    organization_id,

    provider,

    category,

    capability,

    estimated_cost,

    operation,

    execute,

    metadata = {},

  }) {

    const connection =
      await IntegrationConnectionRepository.get(
        organization_id,
        provider
      );

    if (!connection) {
      throw new Error(
        `${provider} is not connected.`
      );
    }

    if (!connection.enabled) {
      throw new Error(
        `${provider} is disabled.`
      );
    }

    await WalletRuntime.reserve({
      organization_id,
      amount: estimated_cost,
      provider,
      reference: operation,
    });

    try {

      const result =
        await execute({
          connection,
        });

      await WalletRuntime.charge({
        organization_id,
        amount: estimated_cost,
        provider,
        reference: operation,
      });

      return result;

    } catch (error) {

      await WalletRuntime.release({
        organization_id,
        amount: estimated_cost,
        provider,
        reference: operation,
      });

      throw error;

    }

  },

};
