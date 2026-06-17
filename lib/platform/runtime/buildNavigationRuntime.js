import { SYSTEM_REGISTRY } from "@/lib/shared/architecture/systemRegistry";
import { DOMAIN_REGISTRY } from "@/lib/platform/domains/domainRegistry";

/**
 * SINGLE NAVIGATION ENGINE (FINAL LOCKED VERSION)
 */

export async function buildNavigationRuntime({
  organization,
  role,
}) {

  const system = SYSTEM_REGISTRY;
  const domains = Object.values(DOMAIN_REGISTRY);

  const executive = Object.entries(system).map(([key, value]) => ({
    id: key,
    name: value.title,
    type: "executive",
  }));

  const modules = domains.map(d => ({
    id: d.name,
    name: d.title,
    route: d.route,
    category: d.category,
  }));

  const installed = new Set(
    (organization?.modules || []).map(m => m.module_id || m.id)
  );

  return {
    success: true,
    navigation: {
      executive,
      modules: modules.filter(m =>
        installed.size === 0 ? true : installed.has(m.id)
      ),
    }
  };
}
