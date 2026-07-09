export const DOMAIN_RUNTIMES = {

  finance: () =>
    import("@/lib/finance/FinanceRuntime")
      .then(m => m.FinanceRuntime),

  services: () =>
    import("@/lib/platform/service-runtime/ServicesRuntime")
      .then(m => m.ServicesRuntime),

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
