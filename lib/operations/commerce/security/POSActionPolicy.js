const FULL_ACCESS_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
  "ADMIN",
]);

const SUPERVISOR_ROLES = new Set([
  ...FULL_ACCESS_ROLES,
  "MANAGER",
  "GENERAL_MANAGER",
  "DUTY_MANAGER",
  "SUPERVISOR",
  "SHIFT_MANAGER",
  "RESTAURANT_MANAGER",
  "VENUE_MANAGER",
]);

const CASHIER_ROLES = new Set([
  ...SUPERVISOR_ROLES,
  "CASHIER",
  "HEAD_CASHIER",
  "POS_OPERATOR",
]);

const SERVICE_ROLES = new Set([
  ...CASHIER_ROLES,
  "WAITER",
  "SERVER",
  "SERVICE",
  "SERVICE_STAFF",
  "BARTENDER",
  "BAR",
  "HOST",
  "HOSTESS",
]);

const ACTION_POLICY = Object.freeze({
  ORDER_ENTRY: Object.freeze({
    roles: SERVICE_ROLES,
    permissions: Object.freeze([
      "operations.pos.order",
      "operations.pos.service",
      "operations.pos.*",
      "restaurant.order.create",
      "restaurant.service.manage",
      "restaurant.*",
    ]),
    fallback: true,
  }),
  MOVE_GUESTS: Object.freeze({
    roles: SERVICE_ROLES,
    permissions: Object.freeze([
      "operations.pos.service",
      "operations.pos.*",
      "restaurant.service.manage",
      "restaurant.table.manage",
      "restaurant.*",
    ]),
    fallback: true,
  }),
  MOVE_SEAT: Object.freeze({
    roles: SERVICE_ROLES,
    permissions: Object.freeze([
      "operations.pos.service",
      "operations.pos.*",
      "restaurant.service.manage",
      "restaurant.table.manage",
      "restaurant.*",
    ]),
    fallback: true,
  }),
  CHANGE_CUSTOMER: Object.freeze({
    roles: SERVICE_ROLES,
    permissions: Object.freeze([
      "operations.pos.service",
      "operations.pos.*",
      "restaurant.service.manage",
      "restaurant.customer.change",
      "restaurant.*",
    ]),
    fallback: true,
  }),
  ASSIGN_ITEMS_TO_GROUP: Object.freeze({
    roles: SERVICE_ROLES,
    permissions: Object.freeze([
      "operations.pos.service",
      "operations.pos.*",
      "restaurant.service.manage",
      "restaurant.bill.manage",
      "restaurant.*",
    ]),
    fallback: true,
  }),
  PAYMENT: Object.freeze({
    roles: CASHIER_ROLES,
    permissions: Object.freeze([
      "operations.pos.checkout",
      "operations.pos.payment",
      "operations.pos.*",
      "restaurant.payment.create",
      "restaurant.payment.manage",
      "restaurant.*",
    ]),
    fallback: false,
  }),
  TRANSFER_TABLE: Object.freeze({
    roles: SUPERVISOR_ROLES,
    permissions: Object.freeze([
      "operations.pos.manage",
      "operations.pos.override",
      "operations.pos.*",
      "restaurant.table.override",
      "restaurant.manager",
      "restaurant.*",
    ]),
    fallback: false,
  }),
  MERGE_TABLES: Object.freeze({
    roles: SUPERVISOR_ROLES,
    permissions: Object.freeze([
      "operations.pos.manage",
      "operations.pos.override",
      "operations.pos.*",
      "restaurant.table.override",
      "restaurant.manager",
      "restaurant.*",
    ]),
    fallback: false,
  }),
  CLOSE_TABLE: Object.freeze({
    roles: SUPERVISOR_ROLES,
    permissions: Object.freeze([
      "operations.pos.manage",
      "operations.pos.override",
      "operations.pos.*",
      "restaurant.table.close",
      "restaurant.table.override",
      "restaurant.manager",
      "restaurant.*",
    ]),
    fallback: false,
  }),
});

function normalizeRole(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizePermission(value) {
  return String(value || "").trim().toLowerCase();
}

function flattenPermissions(value, prefix = "") {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenPermissions(entry, prefix));
  }

  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, entry]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      if (entry === true) return [path];
      if (entry === false || entry == null) return [];
      return flattenPermissions(entry, path);
    });
  }

  if (typeof value === "string") {
    return value
      .split(/[\s,;]+/)
      .map((entry) => (prefix ? `${prefix}.${entry}` : entry))
      .filter(Boolean);
  }

  return [];
}

function permissionMatches(granted, required) {
  const actual = normalizePermission(granted);
  const expected = normalizePermission(required);

  if (!actual || !expected) return false;
  if (actual === "*" || actual === expected) return true;

  if (actual.endsWith(".*")) {
    return expected.startsWith(actual.slice(0, -1));
  }

  if (expected.endsWith(".*")) {
    return actual.startsWith(expected.slice(0, -1));
  }

  return false;
}

function accessSnapshot(access = {}) {
  const nested = access.access && typeof access.access === "object"
    ? access.access
    : {};
  const role = normalizeRole(
    access.role ||
    access.role_key ||
    access.role_code ||
    nested.role ||
    nested.role_key ||
    nested.role_code
  );
  const permissions = [
    access.permissions,
    access.permission_keys,
    access.scopes,
    nested.permissions,
    nested.permission_keys,
    nested.scopes,
  ]
    .flatMap((value) => flattenPermissions(value))
    .map(normalizePermission)
    .filter(Boolean);

  return {
    authenticated:
      access.authenticated === true ||
      nested.authenticated === true ||
      Boolean(access.user?.id || access.userId || nested.userId),
    role,
    permissions: [...new Set(permissions)],
  };
}

export function canExecutePOSAction({ access, action } = {}) {
  const normalizedAction = String(action || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const policy = ACTION_POLICY[normalizedAction];

  if (!policy) return false;

  const snapshot = accessSnapshot(access);
  if (!snapshot.authenticated) return false;
  if (FULL_ACCESS_ROLES.has(snapshot.role)) return true;
  if (snapshot.role && policy.roles.has(snapshot.role)) return true;

  if (
    snapshot.permissions.some((granted) =>
      policy.permissions.some((required) =>
        permissionMatches(granted, required)
      )
    )
  ) {
    return true;
  }

  return !snapshot.role && !snapshot.permissions.length && policy.fallback;
}

export function assertPOSActionAllowed({ access, action } = {}) {
  if (canExecutePOSAction({ access, action })) return true;

  const error = new Error(`Permission denied for POS action ${action || "UNKNOWN"}`);
  error.status = 403;
  throw error;
}

export function getPOSAccessSnapshot(access) {
  return accessSnapshot(access);
}

export default Object.freeze({
  assertPOSActionAllowed,
  canExecutePOSAction,
  getPOSAccessSnapshot,
});
