import {
  ERP_REGISTRY as BASE_ERP_REGISTRY,
} from "@/lib/platform/registry/erpRegistry.base.js";
import {
  applyCommercialWorkspaceRegistry,
} from "../../commercial/registry/commercialWorkspaceRegistry.js";
import {
  applyCreativeWorkspaceRegistry,
} from "../../creative/registry/applyCreativeWorkspaceRegistry.js";
import {
  applyOperationsWorkspaceRegistry,
} from "../../operations/registry/applyOperationsWorkspaceRegistry.js";
import {
  applyPeopleWorkspaceRegistry,
} from "../../people/registry/peopleWorkspaceRegistry.js";
import {
  applyAdministrationWorkspaceRegistry,
} from "../administration/registry/administrationWorkspaceRegistry.js";
import {
  applySupplyChainWorkspaceRegistry,
} from "../../inventory/registry/supplyChainWorkspaceRegistry.js";
import {
  applyFinanceWorkspaceRegistry,
} from "../../finance/registry/financeWorkspaceRegistry.js";
import {
  applySolutionsWorkspaceRegistry,
} from "../../solutions/registry/solutionsWorkspaceRegistry.js";
import {
  applyFinanceVatTaxContractConvergence,
} from "../../finance/workspaces/FinanceVatTaxContractConvergence.js";

applyCommercialWorkspaceRegistry(BASE_ERP_REGISTRY);
applyCreativeWorkspaceRegistry(BASE_ERP_REGISTRY);
applyOperationsWorkspaceRegistry(BASE_ERP_REGISTRY);
applyPeopleWorkspaceRegistry(BASE_ERP_REGISTRY);
applyAdministrationWorkspaceRegistry(BASE_ERP_REGISTRY);
applySupplyChainWorkspaceRegistry(BASE_ERP_REGISTRY);
applyFinanceWorkspaceRegistry(BASE_ERP_REGISTRY);
applySolutionsWorkspaceRegistry(BASE_ERP_REGISTRY);
applyFinanceVatTaxContractConvergence();

export const ERP_REGISTRY = BASE_ERP_REGISTRY;
export * from "@/lib/platform/registry/erpRegistry.base.js";
