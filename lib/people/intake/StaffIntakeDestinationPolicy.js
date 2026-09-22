const FULL_ACCESS_ROLES = new Set([
  "SUPER_ADMIN",
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
]);

const ROLE_DESTINATIONS = Object.freeze({
  ACCOUNTING: ["ACCOUNTING"],
  FINANCE: ["ACCOUNTING"],
  BOOKKEEPER: ["ACCOUNTING"],
  MANAGER: ["MANAGER"],
  HR_ADMIN: ["PEOPLE", "MANAGER"],
  PEOPLE: ["PEOPLE"],
  HOUSEKEEPING: ["HOUSEKEEPING"],
  HOUSEKEEPER: ["HOUSEKEEPING"],
  FRONT_DESK: ["FRONT_DESK"],
  RECEPTION: ["FRONT_DESK"],
  RECEPTIONIST: ["FRONT_DESK"],
  MAINTENANCE: ["MAINTENANCE"],
  TECHNICIAN: ["MAINTENANCE", "FIELD_SERVICE"],
  FIELD_TECHNICIAN: ["FIELD_SERVICE"],
  SUPPLY_CHAIN: ["SUPPLY_CHAIN"],
  PROCUREMENT: ["SUPPLY_CHAIN"],
  PURCHASING: ["SUPPLY_CHAIN"],
  COMMERCIAL: ["COMMERCIAL"],
  SALES: ["COMMERCIAL"],
  PROJECTS: ["PROJECTS"],
  PROJECT_MANAGER: ["PROJECTS"],
});

function text(value, limit = 160) {
  return String(value ?? "").trim().slice(0, limit);
}

function normalizedRole(value) {
  return text(value, 80).toUpperCase();
}

function normalizedPermission(value) {
  return text(value, 120).toLowerCase();
}

export function allowedStaffIntakeDestinations({
  role = null,
  department = null,
  permissions = [],
} = {}) {
  const roleKey = normalizedRole(role);
  const departmentKey = normalizedRole(department);
  if (FULL_ACCESS_ROLES.has(roleKey)) return ["*"];

  const destinations = new Set([
    ...(ROLE_DESTINATIONS[roleKey] || []),
    ...(ROLE_DESTINATIONS[departmentKey] || []),
  ]);

  for (const permission of Array.isArray(permissions) ? permissions : []) {
    const value = normalizedPermission(permission);
    if (value === "*") return ["*"];
    if (value.startsWith("finance")) destinations.add("ACCOUNTING");
    if (value.startsWith("people") || value.startsWith("hr")) destinations.add("PEOPLE");
    if (value.startsWith("housekeeping")) destinations.add("HOUSEKEEPING");
    if (value.startsWith("front") || value.startsWith("reservations")) destinations.add("FRONT_DESK");
    if (value.startsWith("maintenance")) destinations.add("MAINTENANCE");
    if (value.startsWith("supply") || value.startsWith("inventory") || value.startsWith("procurement")) destinations.add("SUPPLY_CHAIN");
    if (value.startsWith("field")) destinations.add("FIELD_SERVICE");
    if (value.startsWith("commercial") || value.startsWith("sales")) destinations.add("COMMERCIAL");
    if (value.startsWith("project")) destinations.add("PROJECTS");
    if (value.startsWith("operations.manage") || value.startsWith("operations.control")) destinations.add("MANAGER");
  }

  return [...destinations];
}

export function canReviewStaffIntake(input = {}) {
  return allowedStaffIntakeDestinations(input).length > 0;
}

export const STAFF_INTAKE_FULL_ACCESS_ROLES = Object.freeze([...FULL_ACCESS_ROLES]);
export const STAFF_INTAKE_ROLE_DESTINATIONS = ROLE_DESTINATIONS;
