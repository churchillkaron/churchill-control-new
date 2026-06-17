import { getModules } from "@/lib/platform/data/getModules";
import { getPlanConfig } from "@/lib/platform/billing/subscriptionState";

/**
 * FINAL TENANT MODULE RESOLUTION (SAAS ENFORCED)
 */

export async function resolveTenantModules({
  tenantId,
  organizationId,
  industry,
  plan = "free",
}) {
  const config = getPlanConfig(plan);

  const modules = await getModules({
    organizationId,
    industry,
  });

  const allowed = config.modules;

  return modules
    .filter((m) => allowed.includes(m.key))
    .map((m) => ({
      key: m.key,
      route: m.route || `/${m.key}`,
      enabled: true,
    }));
}
