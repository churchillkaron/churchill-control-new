export {
  ERP_REGISTRY,
  getErpDomains,
  getErpSolutions,
  getWorkspaceItems,
} from "@/lib/platform/registry/erpRegistry";

export const ERP_DOMAIN_REGISTRY =
  ERP_REGISTRY.domains.map((domain) => ({
    ...domain,
    sort_order: domain.order,
  }));

export const SOLUTION_REGISTRY =
  ERP_REGISTRY.solutions.map((solution) => ({
    ...solution,
    sort_order: solution.order,
  }));
