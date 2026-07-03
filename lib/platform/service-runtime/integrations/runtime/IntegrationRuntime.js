import { WalletRuntime }
from "@/lib/platform/service-runtime/wallet/runtime/WalletRuntime";

export const IntegrationRuntime = {

  async execute({

    organization_id,

    provider,

    capability,

    operation,

    estimated_cost,

    execute,

    metadata = {},

  }) {

    await WalletRuntime.reserve({

      organization_id,

      amount:
        estimated_cost,

      provider,

      reference:
        operation,

    });

    try {

      const result =
        await execute();

      return result;

    } catch (error) {

      await WalletRuntime.release({

        organization_id,

        amount:
          estimated_cost,

        provider,

        reference:
          operation,

      });

      throw error;

    }

  },

};
