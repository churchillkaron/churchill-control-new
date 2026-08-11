import {
  ERP_REGISTRY as BASE_ERP_REGISTRY,
} from "@/lib/platform/registry/erpRegistry.base";
import {
  applyCommercialWorkspaceRegistry,
} from "@/lib/commercial/registry/commercialWorkspaceRegistry";

applyCommercialWorkspaceRegistry(BASE_ERP_REGISTRY);

export const ERP_REGISTRY = BASE_ERP_REGISTRY;
export * from "@/lib/platform/registry/erpRegistry.base";
