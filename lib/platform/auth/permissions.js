/**
 * AVANTIQO PERMISSION ENGINE
 */

export const ROLE_PERMISSIONS = {
  OWNER: [
    "pos",
    "finance",
    "inventory",
    "marketing",
    "workforce",
    "automation",
    "intelligence",
    "healthcare",
  ],

  MANAGER: [
    "pos",
    "inventory",
    "marketing",
    "workforce",
  ],

  STAFF: [
    "pos",
  ],
};

export function getAllowedModules(role = "STAFF") {
  return ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.STAFF;
}

export function filterModulesByRole(modules = [], role = "STAFF") {
  const allowed = getAllowedModules(role);

  return modules.filter((m) => allowed.includes(m.key));
}
