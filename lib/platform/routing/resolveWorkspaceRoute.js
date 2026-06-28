export function normalizeModuleId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
}

const LEGACY_SYSTEM_ROUTES = new Set([
  "/admin",
  "/analytics",
  "/analytics/live",
  "/analytics/revenue",
  "/analytics/sales",
  "/automation/approvals",
  "/automation/approvals-center",
  "/automation/live",
  "/bar",
  "/commercial/revenue",
  "/control",
  "/control-room",
  "/commercial/customers",
  "/dashboard",
  "/design",
  "/design/assets",
  "/design/brand",
  "/design/documents",
  "/design/jobs",
  "/design/studio",
  "/design/templates",
  "/history",
  "/history/days",
  "/inventory",
  "/inventory/expiry",
  "/inventory/ingredients",
  "/inventory/ledger",
  "/inventory/low-stock",
  "/inventory/monitoring",
  "/operations/kitchen",
  "/operations/kitchen/expo",
  "/management",
  "/management/invoices",
  "/management/messages",
  "/management/payments",
  "/management/performance",
  "/management/salary",
  "/management/schedule",
  "/management/shifts",
  "/management/staff",
  "/commercial/marketing",
  "/commercial/marketing/assets",
  "/commercial/marketing/dashboard",
  "/commercial/marketing/design",
  "/commercial/marketing/operations",
  "/commercial/marketing/queue",
  "/commercial/marketing/social",
  "/marketplace",
  "/monitoring/dashboard",
  "/monitoring/live",
  "/onboarding",
  "/organization",
  "/payroll",
  "/payroll/governance",
  "/payroll/live",
  "/platform",
  "/operations/pos",
  "/operations/pos/history",
  "/operations/pos/modifiers",
  "/operations/pos/orders",
  "/operations/pos/payments",
  "/operations/pos/receipts",
  "/operations/pos/shifts",
  "/operations/pos/waiter",
  "/procurement",
  "/procurement/dashboard",
  "/procurement/goods-receipts",
  "/procurement/purchase-orders",
  "/procurement/purchase-requests",
  "/procurement/receiving",
  "/procurement/replenishment",
  "/procurement/suppliers",
  "/procurement/vendors",
  "/operations/production",
  "/operations/production/approval",
  "/operations/production/batches",
  "/operations/production/costing",
  "/operations/production/logs",
  "/operations/production/performance",
  "/operations/production/prepared",
  "/operations/production/recipe-components",
  "/operations/production/recipes",
  "/operations/production/usage",
  "/operations/production/waste",
  "/restaurant/kitchen",
  "/schedule",
  "/settings",
  "/settings/business",
  "/settings/dishes",
  "/settings/kitchen",
  "/settings/marketing",
  "/settings/payroll",
  "/settings/pos",
  "/settings/production-setup",
  "/settings/service-charge",
  "/settings/staff-setup",
  "/settings/stock-setup",
  "/settings/system",
  "/settings/tables",
  "/settings/users",
  "/operations/tables",
  "/timeline",
]);

export function resolveWorkspaceRoute({
  organizationId,
  moduleId,
  workspaceId,
  capabilityId,
  route,
}) {
  if (!organizationId) {
    return "#";
  }

  if (route) {
    const clean = String(route).startsWith("/")
      ? String(route)
      : `/${route}`;

    if (LEGACY_SYSTEM_ROUTES.has(clean)) {
      return clean;
    }

    return `/workspace/${organizationId}${clean}`;
  }

  const resolvedModuleId =
    normalizeModuleId(
      moduleId ||
        workspaceId ||
        capabilityId
    );

  if (!resolvedModuleId || resolvedModuleId === "home") {
    return `/workspace/${organizationId}`;
  }

  const aliases = {
    dashboard: "",
    commercial: "commercial",
    customers: "customers",
    operations: "operations",
    "supply-chain": "supply-chain",
    supply_chain: "supply-chain",
    procurement: "supply-chain",
    inventory: "supply-chain",
    finance: "finance",
    people: "people",
    workforce: "people",
    hr: "people",
    projects: "projects",
    documents: "documents",
    analytics: "analytics",
    ai: "ai",
    intelligence: "ai",
    administration: "administration",
    admin: "administration",
    settings: "administration",
  };

  const target =
    Object.prototype.hasOwnProperty.call(
      aliases,
      resolvedModuleId
    )
      ? aliases[resolvedModuleId]
      : resolvedModuleId;

  if (!target) {
    return `/workspace/${organizationId}`;
  }

  return `/workspace/${organizationId}/${target}`;
}
