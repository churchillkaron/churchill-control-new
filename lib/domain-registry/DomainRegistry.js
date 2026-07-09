import { ERP_REGISTRY } from "@/lib/platform/registry/erpRegistry";

export function getDomains() {
  return ERP_REGISTRY.domains || {};
}

export function getDomain(id) {
  return ERP_REGISTRY.domains?.[id] || null;
}
