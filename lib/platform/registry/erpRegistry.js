import {
  ERP_REGISTRY as BASE_ERP_REGISTRY,
} from "@/lib/platform/registry/erpRegistry.base.js";
import {
  applyCommercialWorkspaceRegistry,
} from "@/lib/commercial/registry/commercialWorkspaceRegistry";
import {
  applyOperationsWorkspaceRegistry,
} from "@/lib/operations/registry/applyOperationsWorkspaceRegistry";
import {
  applyPeopleWorkspaceRegistry,
} from "@/lib/people/registry/peopleWorkspaceRegistry";
import {
  applyAdministrationWorkspaceRegistry,
} from "@/lib/platform/administration/registry/administrationWorkspaceRegistry";
import {
  applySupplyChainWorkspaceRegistry,
} from "@/lib/inventory/registry/supplyChainWorkspaceRegistry";
import {
  applyFinanceWorkspaceRegistry,
} from "@/lib/finance/registry/financeWorkspaceRegistry";

applyCommercialWorkspaceRegistry(BASE_ERP_REGISTRY);
applyOperationsWorkspaceRegistry(BASE_ERP_REGISTRY);
applyPeopleWorkspaceRegistry(BASE_ERP_REGISTRY);
applyAdministrationWorkspaceRegistry(BASE_ERP_REGISTRY);
applySupplyChainWorkspaceRegistry(BASE_ERP_REGISTRY);
applyFinanceWorkspaceRegistry(BASE_ERP_REGISTRY);

export const ERP_REGISTRY = BASE_ERP_REGISTRY;
export * from "@/lib/platform/registry/erpRegistry.base.js";
