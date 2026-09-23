const FULL_ROLES = new Set([
  "OWNER", "ORGANIZATION_OWNER", "ORG_OWNER", "PLATFORM_OWNER", "SUPER_ADMIN", "ADMIN",
  "MANAGER", "GENERAL_MANAGER", "HOTEL_MANAGER", "DUTY_MANAGER", "SUPERVISOR",
]);

const ROLE_GROUPS = Object.freeze({
  HOUSEKEEPING: new Set(["HOUSEKEEPING", "HOUSEKEEPER", "ROOM_ATTENDANT", "HOUSEKEEPING_SUPERVISOR"]),
  FRONT_DESK: new Set(["FRONT_DESK", "FRONTDESK", "RECEPTION", "RECEPTIONIST", "GUEST_SERVICES", "RESERVATIONS", "RESERVATION_AGENT", "NIGHT_AUDIT", "NIGHT_AUDITOR"]),
  MAINTENANCE: new Set(["MAINTENANCE", "ENGINEERING", "ENGINEER", "TECHNICIAN"]),
  CONCIERGE: new Set(["CONCIERGE", "GUEST_RELATIONS"]),
});

function normalize(value) {
  return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function permissionsOf(access = {}) {
  return [
    ...(Array.isArray(access.permissions) ? access.permissions : []),
    ...(Array.isArray(access.access?.permissions) ? access.access.permissions : []),
  ].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
}

function permissionMatches(granted, required) {
  if (!granted || !required) return false;
  if (granted === "*" || granted === required) return true;
  if (granted.endsWith(".*")) return required.startsWith(granted.slice(0, -1));
  return false;
}

function roleCandidates(access = {}) {
  return new Set([
    access.role,
    access.access?.role,
    access.staff?.role,
    access.staff?.position,
    access.staff?.department,
  ].map(normalize).filter(Boolean));
}

export function canAccessHotelOperationalArea(access, area) {
  const normalizedArea = normalize(area);
  const roles = roleCandidates(access);
  if ([...roles].some((role) => FULL_ROLES.has(role))) return true;

  const group = ROLE_GROUPS[normalizedArea];
  if (group && [...roles].some((role) => group.has(role))) return true;

  const permissions = permissionsOf(access);
  const required = [
    "hotel.*",
    "operations.hotel.*",
    `hotel.${normalizedArea.toLowerCase()}.*`,
    `operations.hotel.${normalizedArea.toLowerCase()}.*`,
  ];
  if (normalizedArea === "FRONT_DESK") required.push("frontdesk.*", "front-desk.*", "reservations.*");
  if (normalizedArea === "HOUSEKEEPING") required.push("housekeeping.*");
  if (normalizedArea === "CONCIERGE") required.push("concierge.*");
  if (normalizedArea === "MAINTENANCE") required.push("maintenance.*", "engineering.*");

  return permissions.some((granted) => required.some((candidate) => permissionMatches(granted, candidate)));
}

export function canAccessAnyHotelOperationalArea(access) {
  return ["FRONT_DESK", "HOUSEKEEPING", "MAINTENANCE", "CONCIERGE"]
    .some((area) => canAccessHotelOperationalArea(access, area));
}

export function assertAnyHotelOperationalAccess(access) {
  if (canAccessAnyHotelOperationalArea(access)) return true;
  const error = new Error("Hotel operational access denied");
  error.status = 403;
  throw error;
}

export function assertHotelOperationalAccess({ access, area } = {}) {
  if (canAccessHotelOperationalArea(access, area)) return true;
  const error = new Error(`Hotel ${String(area || "operational").toLowerCase()} access denied`);
  error.status = 403;
  throw error;
}

export default Object.freeze({
  canAccessHotelOperationalArea,
  canAccessAnyHotelOperationalArea,
  assertHotelOperationalAccess,
  assertAnyHotelOperationalAccess,
});
