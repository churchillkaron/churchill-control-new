export const DOMAIN_RUNTIMES = {

  finance: async () => {

    await import(
      "@/lib/finance/accounts-receivable/bootstrap/registerPayloadMappers"
    );

    await import(
      "@/lib/finance/bootstrap/registerFinanceBilling"
    );

    const m =
      await import("@/lib/finance/FinanceRuntime");

    return m.FinanceRuntime;

  },

  services: async () => {

    await import(
      "@/lib/marketing/bootstrap/registerMarketingPublishers"
    );

    const m =
      await import("@/lib/platform/service-runtime/ServicesRuntime");

    return m.ServicesRuntime;

  },

};


export async function getDomainRuntime(domain) {

  const loader =
    DOMAIN_RUNTIMES[domain];

  if (!loader) {
    throw new Error(
      `Domain runtime not registered: ${domain}`
    );
  }

  return await loader();

}
