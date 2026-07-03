export function normalizeModuleId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
}

const LEGACY_SYSTEM_ROUTES = new Set([
  "/admin",
  "/analytics",
  "/automation/approvals",
  "/automation/approvals-center",
  "/automation/live",
  "/bar",
  "/control",
  "/control-room",
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
  "/management",
  "/management/invoices",
  "/management/messages",
  "/management/payments",
  "/management/performance",
  "/management/salary",
  "/management/schedule",
  "/management/shifts",
  "/management/staff",
  "/marketplace",
  "/monitoring/dashboard",
  "/monitoring/live",
  "/onboarding",
  "/organization",
  "/payroll",
  "/payroll/governance",
  "/payroll/live",
  "/platform",
  "/procurement",
  "/restaurant/kitchen",
  "/schedule",
  "/settings",
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
