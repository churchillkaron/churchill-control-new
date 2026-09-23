import { canReviewStaffIntake } from "@/lib/people/intake/StaffIntakeDestinationPolicy";

function text(value) {
  return String(value ?? "").trim();
}

function normalizePermission(value) {
  return text(value).toLowerCase();
}

function permissionMatches(granted, required) {
  const g = normalizePermission(granted);
  const r = normalizePermission(required);
  if (!g || !r) return false;
  if (g === "*" || g === r) return true;
  if (g.endsWith(".*")) return r.startsWith(g.slice(0, -1));
  if (r.endsWith(".*")) return g.startsWith(r.slice(0, -1));
  return false;
}

function hasAnyPermission(permissions, required = []) {
  return required.some((candidate) =>
    permissions.some((granted) => permissionMatches(granted, candidate))
  );
}

export const STAFF_PORTAL_STANDARD_NAVIGATION = Object.freeze([
  { key: "my-work", label: "My Work", href: "/staff", icon: "LayoutDashboard", exact: true },
  { key: "my-day", label: "My Day", href: "/staff/my-day", icon: "Navigation" },
  { key: "intake", label: "Intake", href: "/staff/intake", icon: "Files", reviewOnly: true },
  { key: "profile", label: "Profile", href: "/staff/profile", icon: "UserRound" },
  { key: "my-documents", label: "My Documents", href: "/staff/documents", icon: "Files" },
  { key: "availability", label: "Availability", href: "/staff/availability", icon: "CalendarCheck2" },
  { key: "requests", label: "Requests", href: "/staff/requests", icon: "CalendarClock" },
  { key: "earnings", label: "Earnings", href: "/staff/earnings", icon: "Banknote" },
]);


const ROLE_OPERATIONAL_SURFACES = Object.freeze([
  { key: "pos", label: "POS", route: "operations/pos", icon: "CreditCard", industries: ["restaurant", "bar", "nightclub"], roles: ["WAITER", "CASHIER", "FOH"], departments: ["FOH", "SERVICE"] },
  { key: "bar", label: "Bar", route: "operations/bar", icon: "Wine", industries: ["restaurant", "bar", "nightclub"], roles: ["BAR", "BARTENDER"], departments: ["BAR"] },
  { key: "kitchen", label: "Kitchen", route: "operations/kitchen", icon: "ChefHat", industries: ["restaurant", "bar", "nightclub"], roles: ["KITCHEN", "CHEF", "COOK"], departments: ["KITCHEN", "BOH"] },
  { key: "front-desk", label: "Front Desk", route: "operations/front-desk", icon: "Bell", industries: ["hotel", "hospitality"], roles: ["FRONT_DESK", "RECEPTION", "RECEPTIONIST"], departments: ["FRONT_DESK", "RECEPTION"] },
  { key: "housekeeping", label: "Housekeeping", route: "operations/housekeeping", icon: "BedDouble", industries: ["hotel", "hospitality"], roles: ["HOUSEKEEPING", "HOUSEKEEPER"], departments: ["HOUSEKEEPING"] },
  { key: "maintenance", label: "Maintenance", route: "operations/maintenance", icon: "Wrench", industries: ["hotel", "hospitality"], roles: ["MAINTENANCE", "TECHNICIAN"], departments: ["MAINTENANCE", "ENGINEERING"] },
  { key: "concierge", label: "Concierge", route: "operations/concierge", icon: "ConciergeBell", industries: ["hotel", "hospitality"], roles: ["CONCIERGE"], departments: ["CONCIERGE"] },
  { key: "field-service", label: "My Field Work", route: "operations/field-service/technician", icon: "Route", industries: ["pest_control", "field_service", "services"], roles: ["TECHNICIAN", "FIELD_TECHNICIAN", "OPERATOR"], departments: ["FIELD_SERVICE"] },
]);

const OPERATIONAL_MODULES = Object.freeze([
  {
    key: "operations",
    label: "Operations",
    route: "operations",
    icon: "Activity",
    permissions: ["operations.*", "operations.manage", "operations.control", "service_management.manage", "service-management.manage"],
  },
  {
    key: "pos",
    label: "POS",
    route: "operations/pos",
    icon: "CreditCard",
    permissions: ["pos", "pos.*", "billing"],
    industries: ["restaurant", "bar", "nightclub", "food_beverage", "food-and-beverage", "retail", "shop", "store"],
  },
  {
    key: "restaurant",
    label: "Restaurant",
    route: "restaurant",
    icon: "UtensilsCrossed",
    permissions: ["restaurant", "restaurant.*", "operations.restaurant.*", "operations.pos.restaurant.*"],
  },
  {
    key: "hotel",
    label: "Hotel",
    route: "hotel",
    icon: "Hotel",
    permissions: ["hotel.*", "operations.hotel.*", "reservations.*", "frontdesk.*", "front-desk.*", "housekeeping.*", "concierge.*"],
  },
  {
    key: "pest-control",
    label: "Field Service",
    route: "pest_control",
    icon: "Wrench",
    permissions: ["pest_control.*", "pest-control.*", "field_service.*", "field-service.*", "operations.field_service.*", "operations.field-service.*"],
  },
  {
    key: "retail",
    label: "Retail",
    route: "retail",
    icon: "ShoppingBag",
    permissions: ["retail", "retail.*", "operations.retail.*", "pos.retail.*"],
  },
  {
    key: "commercial",
    label: "Commercial",
    route: "commercial",
    icon: "Handshake",
    permissions: ["commercial.*", "sales.*", "customers.*", "customer.*", "marketing.*", "crm.*"],
  },
  {
    key: "supply-chain",
    label: "Supply Chain",
    route: "supply-chain",
    icon: "PackageSearch",
    permissions: ["supply_chain.*", "supply-chain.*", "inventory", "inventory.*", "procurement", "procurement.*", "purchasing.*"],
  },
  {
    key: "projects",
    label: "Projects",
    route: "projects",
    icon: "BriefcaseBusiness",
    permissions: ["projects.*", "project.*", "project_execution.*", "project-execution.*"],
  },
  {
    key: "construction",
    label: "Construction",
    route: "construction",
    icon: "HardHat",
    permissions: ["construction.*"],
  },
  {
    key: "documents",
    label: "Documents",
    route: "documents",
    icon: "Files",
    permissions: ["documents.*", "document.*", "document_control.*", "document-control.*"],
  },
  {
    key: "finance",
    label: "Finance",
    route: "finance",
    icon: "Landmark",
    permissions: ["finance", "finance.*"],
  },
  {
    key: "analytics",
    label: "Analytics",
    route: "analytics",
    icon: "ChartNoAxesCombined",
    permissions: ["analytics.*", "reporting.*"],
  },
  {
    key: "creative",
    label: "Creative",
    route: "creative",
    icon: "Clapperboard",
    permissions: ["creative.*"],
  },
]);

export function buildStaffPortalNavigation({
  organizationId,
  role = null,
  permissions = [],
  membership = null,
  staff = null,
  organization = null,
} = {}) {
  const organizationKey = text(organizationId);
  if (!organizationKey) throw new Error("STAFF_PORTAL_ORGANIZATION_REQUIRED");

  const normalizedPermissions = [...new Set((permissions || []).map(normalizePermission).filter(Boolean))];
  const organizationIndustry = text(organization?.industry).toLowerCase().replaceAll(" ", "_");
  const metadata = membership?.metadata && typeof membership.metadata === "object" ? membership.metadata : {};
  const staffMetadata = staff?.metadata && typeof staff.metadata === "object" ? staff.metadata : {};
  const explicitAllow = [
    ...(Array.isArray(metadata.staff_portal_modules) ? metadata.staff_portal_modules : []),
    ...(Array.isArray(staffMetadata.staff_portal_modules) ? staffMetadata.staff_portal_modules : []),
  ].map((value) => text(value).toLowerCase()).filter(Boolean);
  const explicitDeny = [
    ...(Array.isArray(metadata.staff_portal_hidden_modules) ? metadata.staff_portal_hidden_modules : []),
    ...(Array.isArray(staffMetadata.staff_portal_hidden_modules) ? staffMetadata.staff_portal_hidden_modules : []),
  ].map((value) => text(value).toLowerCase()).filter(Boolean);

  const roleKey = text(role || staff?.role).toUpperCase();
  const departmentKey = text(staff?.department).toUpperCase();
  const roleOperational = ROLE_OPERATIONAL_SURFACES
    .filter((module) => {
      if (explicitDeny.includes(module.key)) return false;
      const industryMatched = !Array.isArray(module.industries) || module.industries.includes(organizationIndustry);
      if (!industryMatched) return false;
      return (module.roles || []).includes(roleKey) || (module.departments || []).includes(departmentKey);
    })
    .map((module) => ({
      key: module.key,
      label: module.label,
      href: `/workspace/${encodeURIComponent(organizationKey)}/${module.route}`,
      icon: module.icon,
      operational: true,
      source: "role_context",
    }));

  const permissionOperational = OPERATIONAL_MODULES
    .filter((module) => {
      if (explicitDeny.includes(module.key)) return false;
      if (explicitAllow.includes(module.key)) return true;
      const industryMatched = !Array.isArray(module.industries) || module.industries.includes(organizationIndustry);
      if (!industryMatched) return false;
      if (hasAnyPermission(normalizedPermissions, module.permissions)) return true;
      return hasAnyPermission(normalizedPermissions, module.genericPermissions || []);
    })
    .map((module) => ({
      key: module.key,
      label: module.label,
      href: `/workspace/${encodeURIComponent(organizationKey)}/${module.route}`,
      icon: module.icon,
      operational: true,
    }));

  const operationalByKey = new Map();
  for (const item of [...roleOperational, ...permissionOperational]) {
    if (!operationalByKey.has(item.key)) operationalByKey.set(item.key, item);
  }
  const operational = [...operationalByKey.values()];

  return {
    contract: "AVANTIQO_STAFF_PORTAL_NAVIGATION_V1",
    organization_id: organizationKey,
    role: text(role) || null,
    organization: organization ? {
      id: organizationKey,
      name: text(organization?.name) || null,
      industry: text(organization?.industry) || null,
      organization_type: text(organization?.organization_type) || null,
    } : null,
    standard: STAFF_PORTAL_STANDARD_NAVIGATION
      .filter((item) => !item.reviewOnly || canReviewStaffIntake({
        role: roleKey,
        department: departmentKey,
        permissions: normalizedPermissions,
      }))
      .map((item) => ({ ...item })),
    operational,
    permissions_applied_server_side: true,
  };
}

export default Object.freeze({ build: buildStaffPortalNavigation });
