import {
  operatorRegistryDomainLoaders,
} from "@/lib/platform/registry/OperatorRegistryDomainRuntimes";
import { withOperatorExecutionBoundary } from "@/lib/operator/runtime/OperatorExecutionBoundaryRuntime.mjs";

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
    try {
      const [module, portfolioModule, portfolioControlModule] = await Promise.all([
        import("@/lib/platform/runtime/PlatformDomainRuntime"),
        import("@/lib/platform/capabilities/createProductEngineeringPortfolioCapability"),
        import("@/lib/platform/capabilities/createProductEngineeringPortfolioControlCapability"),
      ]);
      const base = module.PlatformDomainRuntime;
      return {
        ...base,
        capabilities: {
          ...(base.capabilities || {}),
          product_engineering_portfolio: {
            ...(base.capabilities?.product_engineering_portfolio || {}),
            execute: async () =>
              withOperatorExecutionBoundary(portfolioModule.createProductEngineeringPortfolioCapability()),
          },
          product_engineering_portfolio_control: {
            ...(base.capabilities?.product_engineering_portfolio_control || {}),
            execute: async () =>
              withOperatorExecutionBoundary(portfolioControlModule.createProductEngineeringPortfolioControlCapability()),
          },
        },
      };
    } catch (error) {
      console.error(
        "OPERATOR_PLATFORM_RUNTIME_DISCOVERY_FALLBACK",
        error?.message || error,
      );
      return {
        domain: "platform",
        name: "Avantiqo Platform Research",
        version: "1.0.0",
        capabilities: {
          research: {
            search: async () => {
              const module = await import(
                "@/lib/platform/capabilities/createOperatorWebResearchCapability"
              );
              return module.createOperatorWebResearchCapability();
            },
          },
          research_source: {
            read: async () => {
              const module = await import(
                "@/lib/platform/capabilities/createOperatorWebSourceReadCapability"
              );
              return module.createOperatorWebSourceReadCapability();
            },
          },
          research_compare: {
            analyze: async () => {
              const module = await import(
                "@/lib/platform/capabilities/createOperatorResearchCompareCapability"
              );
              return module.createOperatorResearchCompareCapability();
            },
          },
        },
      };
    }
  },

  commercial: async () => {
    const module = await import("@/lib/commercial/runtime/CommercialRuntime");
    return module.buildCommercialRuntime();
  },

  creative: async () => {
    try {
      const module = await import("@/lib/creative/runtime/CreativeRuntime");
      return module.CreativeRuntime;
    } catch (error) {
      console.error(
        "OPERATOR_CREATIVE_RUNTIME_DISCOVERY_FALLBACK",
        error?.message || error,
      );
      return {
        domain: "creative",
        name: "Creative Studio",
        version: "1.0.0",
        capabilities: {
          studio: {
            inspectProject: () =>
              import("@/lib/creative/studio/capabilities/inspectStudioProject"),
            inspectDirection: () =>
              import("@/lib/creative/studio/capabilities/inspectStudioDirection"),
          },
          production: {
            inspect: () =>
              import("@/lib/creative/production/capabilities/inspectCreativeProduction"),
          },
        },
      };
    }
  },

  documents: async () => {
    const module = await import("@/lib/documents/runtime/DocumentsDomainRuntime");
    return module.DocumentsDomainRuntime;
  },

  "supply-chain": async () => {
    const module = await import("@/lib/inventory/runtime/InventoryDomainRuntime");
    return module.InventoryDomainRuntime;
  },

  projects: async () => {
    const module = await import("@/lib/projects/runtime/ProjectsRuntime");
    return module.ProjectsRuntime;
  },

  people: async () => {
    const module = await import("@/lib/people/runtime/PeopleOperatorDomainRuntime");
    return module.PeopleOperatorDomainRuntime;
  },

  compliance: async () => {
    const module = await import("@/lib/compliance/runtime/ComplianceDomainRuntime");
    return module.ComplianceDomainRuntime;
  },

  solutions: async () => {
    const module = await import("@/lib/solutions/runtime/SolutionsOperatorDomainRuntime");
    return module.SolutionsOperatorDomainRuntime;
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

  const bridgedRuntime = await bridged();
  let ownRuntime = null;

  try {
    ownRuntime = await own();
  } catch (error) {
    console.error(
      "OPERATOR_HAND_WRITTEN_DOMAIN_RUNTIME_DISCOVERY_UNAVAILABLE",
      domain,
      error?.message || error,
    );
  }

  // Discovery must not lose a canonical registry-backed domain merely because a
  // hand-written executable runtime needs credentials or infrastructure at import
  // time. The bridge remains read-only discovery truth; execution still runs
  // through UBTE and fails closed at the actual capability boundary.
  if (!ownRuntime) return bridgedRuntime;

  // Hand written capabilities win, so a real implementation is never shadowed by
  // a generated read of the same name.
  const capabilities = { ...(bridgedRuntime?.capabilities || {}) };

  for (const [name, actions] of Object.entries(ownRuntime?.capabilities || {})) {
    capabilities[name] = { ...(capabilities[name] || {}), ...actions };
  }

  return { ...bridgedRuntime, ...ownRuntime, capabilities };
}
