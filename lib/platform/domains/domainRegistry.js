import { ERP_REGISTRY } from "@/lib/platform/registry/erpRegistry";

/**
 * Runtime-only resolver
 * NO domain definitions allowed here anymore
 */
export function getDomains() {
  return Object.values(ERP_REGISTRY.domains || {});
}

export function getDomainById(id) {
  return ERP_REGISTRY.domains?.[id] || null;
}
