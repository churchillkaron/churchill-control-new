import "../providers";
import { platformRuntime } from "../runtime";

export function bootstrapPlatform() {

  return {

    runtime: platformRuntime,

    providers:
      platformRuntime.providers.list(),

    services: {
      wallet:
        platformRuntime.wallet,

      budgets:
        platformRuntime.budgets,

      usage:
        platformRuntime.usage,

      audit:
        platformRuntime.audit,

      pricing:
        platformRuntime.pricing,
    },

    network:
      platformRuntime.network,

  };

}
