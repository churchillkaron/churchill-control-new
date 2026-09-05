import {
  operatorRegistryDomainLoaders,
} from "@/lib/platform/registry/OperatorRegistryDomainRuntimes";

export const DOMAIN_RUNTIMES = {
  finance: async () => {
    await import(
      "@/lib/finance/accounts-receivable/bootstrap/registerPayloadMappers"
    );
    await import("@/lib/finance/bootstrap/registerFinanceBilling");

    const module = await import("@/lib/finance/FinanceRuntime");
    return module.FinanceRuntime;
  },

  operations: async () => {
    const module = await import("@/lib/operations/OperationsDomainRuntime");
    return module.OperationsDomainRuntime;
  },

  platform: async () => {
    const [module, portfolioModule] = await Promise.all([
      import("@/lib/platform/runtime/PlatformDomainRuntime"),
      import("@/lib/platform/capabilities/createProductEngineeringPortfolioCapability"),
    ]);
    const base = module.PlatformDomainRuntime;
    return {
      ...base,
      capabilities: {
        ...(base.capabilities || {}),
        product_engineering_portfolio: {
          ...(base.capabilities?.product_engineering_portfolio || {}),
          execute: async () =>
            portfolioModule.createProductEngineeringPortfolioCapability(),
        },
      },
    };
  },

  commercial: async () => {
    const module = await import("@/lib/commercial/runtime/CommercialRuntime");
    return module.buildCommercialRuntime();
  },

  creative: async () => {
    const module = await import("@/lib/creative/runtime/CreativeRuntime");
    return module.CreativeRuntime;
  },

  restaurant: async () => {
    const module = await import("@/lib/restaurant/RestaurantRuntime");
    return module.RestaurantRuntime;
  },

  services: async () => {
    await import("@/lib/marketing/bootstrap/registerMarketingPublishers");

    const module = await import(
      "@/lib/platform/service-runtime/ServicesRuntime"
    );
    return module.ServicesRuntime;
  },
};

// Domains the ERP registry declares but that have no hand written runtime are
// served by the registry bridge, so the Operator can reach the whole system
// rather than only the domains someone remembered to register. Hand written
// runtimes above always win for the domains they own.
let registryLoaders = null;

function registryDomainLoaders() {
  if (!registryLoaders) {
    registryLoaders = {};

    try {
      // No domain is reserved: a hand written runtime and the registry bridge are
      // merged per domain so finance keeps its real capabilities and also gains
      // every workspace the registry declares.
      registryLoaders = operatorRegistryDomainLoaders();
    } catch (error) {
      console.error("OPERATOR_REGISTRY_DOMAIN_BRIDGE_UNAVAILABLE", error?.message || error);
    }
  }

  return registryLoaders;
}

export function listDomainRuntimeNames() {
  return [...new Set([...Object.keys(DOMAIN_RUNTIMES), ...Object.keys(registryDomainLoaders())])];
}

export async function getDomainRuntime(domain) {
  const own = DOMAIN_RUNTIMES[domain];
  const bridged = registryDomainLoaders()[domain];

  if (!own && !bridged) {
    throw new Error(`Domain runtime not registered: ${domain}`);
  }

  if (own && !bridged) return own();
  if (!own && bridged) return bridged();

  const [ownRuntime, bridgedRuntime] = await Promise.all([own(), bridged()]);

  // Hand written capabilities win, so a real implementation is never shadowed by
  // a generated read of the same name.
  const capabilities = { ...(bridgedRuntime?.capabilities || {}) };

  for (const [name, actions] of Object.entries(ownRuntime?.capabilities || {})) {
    capabilities[name] = { ...(capabilities[name] || {}), ...actions };
  }

  return { ...bridgedRuntime, ...ownRuntime, capabilities };
}
