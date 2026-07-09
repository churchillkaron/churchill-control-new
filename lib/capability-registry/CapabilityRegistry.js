import { ERP_REGISTRY } from "@/lib/platform/registry/erpRegistry";

export const CapabilityRegistry = {
  all() {
    return ERP_REGISTRY.capabilities || {};
  },

  get(id) {
    return ERP_REGISTRY.capabilities?.[id];
  }
};
