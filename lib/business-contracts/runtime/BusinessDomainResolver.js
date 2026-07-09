import { ERP_REGISTRY } from "@/lib/platform/registry/erpRegistry";

/**
 * DOMAIN LAYER IS NOW PURE METADATA ACCESS ONLY
 */

export function getDomain(id) {
  return ERP_REGISTRY.domains?.[id] || null;
}

export function getAllDomains() {
  return ERP_REGISTRY.domains || {};
}
