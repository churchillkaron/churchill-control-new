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

const SPECIAL_PRODUCT_ROUTES = Object.freeze({
  restaurant: "restaurant-system",
  hotel: "hotel-system",
  retail: "retail-system",
  pest_control: "pest-control-system",
});

export function workspaceAccessDecision({
  pathname,
  organizationId,
  productEntitlements = [],
  modules = [],
  role = "",
} = {}) {
  const path = String(pathname || "");
  const root = organizationId ? `/workspace/${organizationId}` : "";
  if (!root || (path !== root && !path.startsWith(`${root}/`))) {
    return { allowed: true, reason: "outside_workspace" };
  }

  const suffix = path.slice(root.length).replace(/^\/+/, "");
  if (!suffix) return { allowed: true, reason: "workspace_home" };

  const first = suffix.split("/")[0];
  if (first === "products") return { allowed: true, reason: "products_hub" };

  const normalizedRole = String(role || "").trim().toUpperCase();
  const adminRoles = new Set(["OWNER", "ORGANIZATION_OWNER", "ORG_OWNER", "PLATFORM_OWNER", "SUPER_ADMIN", "ADMIN"]);
  const developerRoles = new Set([...adminRoles, "DEVELOPER", "INTEGRATOR", "PARTNER"]);

  if (first === "administration") {
    return { allowed: adminRoles.has(normalizedRole), reason: "administration_role" };
  }
  if (first === "developers") {
    return { allowed: developerRoles.has(normalizedRole), reason: "developer_role" };
  }

  if (!hasExactProductOwnership(productEntitlements)) {
    return { allowed: true, reason: "legacy_module_compatibility" };
  }

  const entitledIds = new Set(productEntitlements.map((row) => row?.product_id).filter(Boolean));
  const specialProduct = SPECIAL_PRODUCT_ROUTES[first];
  if (specialProduct) {
    return {
      allowed: entitledIds.has(specialProduct),
      reason: entitledIds.has(specialProduct) ? "owned_industry_product" : "industry_product_not_owned",
    };
  }

  const visibleDomainIds = getOwnedWorkspaceDomainIds({ productEntitlements, modules });
  return {
    allowed: visibleDomainIds.has(first),
    reason: visibleDomainIds.has(first) ? "owned_product_domain" : "product_domain_not_owned",
  };
}
