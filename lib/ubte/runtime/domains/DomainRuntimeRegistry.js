export const DOMAIN_RUNTIMES = {
  finance: async () => {
    await import(
      "@/lib/finance/accounts-receivable/bootstrap/registerPayloadMappers"
    );
    await import("@/lib/finance/bootstrap/registerFinanceBilling");

    const module = await import("@/lib/finance/FinanceRuntime");
    return module.FinanceRuntime;
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

export async function getDomainRuntime(domain) {
  const loader = DOMAIN_RUNTIMES[domain];

  if (!loader) {
    throw new Error(`Domain runtime not registered: ${domain}`);
  }

  return loader();
}
