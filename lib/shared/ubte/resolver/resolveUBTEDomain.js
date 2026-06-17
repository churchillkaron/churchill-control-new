import { DOMAIN_REGISTRY } from "@/lib/platform/domains/domainRegistry";

/**
 * UBTE DOMAIN RESOLVER
 * Converts ANY module → valid UBTE domain
 */

export function resolveUBTEDomain(moduleId) {

  if (!moduleId) {
    throw new Error("UBTE: missing moduleId");
  }

  // 1. Direct match (pos, finance, inventory)
  const direct = DOMAIN_REGISTRY[moduleId];
  if (direct) return moduleId;

  // 2. Route match (/pos, /inventory)
  const routeMatch = Object.entries(DOMAIN_REGISTRY)
    .find(([_, domain]) =>
      domain.route?.includes(moduleId)
    );

  if (routeMatch) {
    return routeMatch[0];
  }

  // 3. Category fallback
  const fallback = Object.entries(DOMAIN_REGISTRY)
    .find(([_, domain]) =>
      domain.category === moduleId
    );

  if (fallback) {
    return fallback[0];
  }

  throw new Error(`UBTE: unknown domain ${moduleId}`);
}
