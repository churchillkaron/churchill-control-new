import { PRODUCT_MODULE_REQUIREMENTS } from "@/lib/platform/entitlements/productProvisioningRegistry";
import { PRODUCT_WORKSPACE_ROUTES } from "@/lib/platform/routing/productWorkspaceRoute";

const MODULE_TO_DOMAIN = Object.freeze({
  pos: "operations", tables: "operations", kitchen: "operations", hotel: "operations",
  frontdesk: "operations", reservations: "operations", housekeeping: "operations",
  concierge: "operations", maintenance: "operations", operations: "operations", bar: "operations",
  finance: "finance", accounting: "finance", hr: "people", schedule: "people", payroll: "people",
  inventory: "supply-chain", procurement: "supply-chain", production: "supply-chain",
  crm: "commercial", marketing_ai: "commercial", customer_portal: "commercial",
  projects: "projects", automation: "operations", analytics: "analytics", owner_ai: "ai",
  design_studio: "creative", compliance: "compliance", governance: "administration",
  settings: "administration", monitoring: "administration", documents: "documents",
});

const ROUTE_DOMAIN_ALIASES = Object.freeze({
  operations: "operations", people: "people", finance: "finance", "supply-chain": "supply-chain",
  projects: "projects", documents: "documents", commercial: "commercial", analytics: "analytics",
  ai: "ai", creative: "creative", compliance: "compliance", administration: "administration",
});
function domainFromProductRoute(productId) {
  const route = PRODUCT_WORKSPACE_ROUTES[productId];
  if (!route) return null;
  const first = String(route).split("/").filter(Boolean)[0];
  return ROUTE_DOMAIN_ALIASES[first] || null;
}

function domainsFromModules(moduleIds = []) {
  return moduleIds.map((id) => MODULE_TO_DOMAIN[id]).filter(Boolean);
}

export function getOwnedWorkspaceDomainIds({ productEntitlements = [], modules = [] } = {}) {
  const entitledProductIds = productEntitlements
    .map((row) => row?.product_id)
    .filter(Boolean);

  if (entitledProductIds.length) {
    const requiredModuleIds = entitledProductIds.flatMap((productId) => PRODUCT_MODULE_REQUIREMENTS[productId] || []);
    const primaryDomains = entitledProductIds.map(domainFromProductRoute).filter(Boolean);
    return new Set([...domainsFromModules(requiredModuleIds), ...primaryDomains]);
  }

  const moduleIds = modules.map((module) => module?.id).filter(Boolean);
  return new Set(domainsFromModules(moduleIds));
}

export function hasExactProductOwnership(productEntitlements = []) {
  return productEntitlements.some((row) => Boolean(row?.product_id));
}
