import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export const CANONICAL_OPERATIONS_ROLES = Object.freeze([
  {
    role_code: "OPERATIONS_ADMIN",
    role_name: "Operations Administrator",
    description: "Administer Operations security, configuration, execution, controls, audit and event recovery.",
    permissions: ["operations.*"],
  },
  {
    role_code: "OPERATIONS_MANAGER",
    role_name: "Operations Manager",
    description: "Manage operational planning, execution, controls and audit without security administration or event recovery.",
    permissions: ["operations.manage", "operations.audit", "operations.import", "operations.ai"],
  },
  {
    role_code: "OPERATIONS_SUPERVISOR",
    role_name: "Operations Supervisor",
    description: "Create, update, execute and control authorised operational records and review their history.",
    permissions: [
      "operations.view",
      "operations.create",
      "operations.update",
      "operations.execute",
      "operations.control",
      "operations.audit",
    ],
  },
  {
    role_code: "OPERATIONS_PLANNER",
    role_name: "Operations Planner",
    description: "Plan, schedule and coordinate operational work and resources without approval or administrative authority.",
    permissions: [
      "operations.view",
      "operations.create",
      "operations.update",
      "operations.planning.*",
      "operations.orchestration.view",
      "operations.resources.view",
    ],
  },
  {
    role_code: "OPERATIONS_OPERATOR",
    role_name: "Operations Operator",
    description: "View assigned operational work and execute permitted lifecycle actions.",
    permissions: ["operations.view", "operations.execute"],
  },
  {
    role_code: "OPERATIONS_AUDITOR",
    role_name: "Operations Auditor",
    description: "Read operational records, immutable events and command history without mutation authority.",
    permissions: ["operations.view", "operations.audit"],
  },
  {
    role_code: "OPERATIONS_VIEWER",
    role_name: "Operations Viewer",
    description: "Read authorised Operations capabilities and records.",
    permissions: ["operations.view"],
  },
]);

function requireValue(value, label) {
  if (!value) throw new Error(`${label} required`);
  return value;
}

async function listRoles(organizationId) {
  const { data, error } = await supabaseAdmin
    .from("operations_roles")
    .select("id, organization_id, role_code, role_name, description, is_system, is_active, created_at, updated_at")
    .eq("organization_id", organizationId)
    .order("role_name", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function ensureCanonicalOperationsRoles(organizationId) {
  requireValue(organizationId, "organizationId");

  const current = await listRoles(organizationId);
  const byCode = new Map(current.map((role) => [role.role_code, role]));
  const missing = CANONICAL_OPERATIONS_ROLES.filter((role) => !byCode.has(role.role_code));

  if (missing.length) {
    const { error } = await supabaseAdmin
      .from("operations_roles")
      .insert(missing.map((role) => ({
        organization_id: organizationId,
        role_code: role.role_code,
        role_name: role.role_name,
        description: role.description,
        is_system: true,
        is_active: true,
      })));

    if (error && String(error.code || "") !== "23505") throw error;
  }

  const roles = await listRoles(organizationId);
  const roleByCode = new Map(roles.map((role) => [role.role_code, role]));

  const { data: existingPermissions, error: permissionError } = await supabaseAdmin
    .from("operations_role_permissions")
    .select("role_id, permission_key")
    .eq("organization_id", organizationId);

  if (permissionError) throw permissionError;

  const existing = new Set((existingPermissions || []).map((row) => (
    `${row.role_id}:${row.permission_key}`
  )));
  const permissionRows = [];

  for (const definition of CANONICAL_OPERATIONS_ROLES) {
    const role = roleByCode.get(definition.role_code);
    if (!role) continue;

    for (const permissionKey of definition.permissions) {
      const key = `${role.id}:${permissionKey}`;
      if (!existing.has(key)) {
        permissionRows.push({
          organization_id: organizationId,
          role_id: role.id,
          permission_key: permissionKey,
        });
      }
    }
  }

  if (permissionRows.length) {
    const { error } = await supabaseAdmin
      .from("operations_role_permissions")
      .insert(permissionRows);

    if (error && String(error.code || "") !== "23505") throw error;
  }

  return roles;
}

export async function listOperationsRoles(organizationId) {
  await ensureCanonicalOperationsRoles(organizationId);
  return listRoles(organizationId);
}

export async function listUserOperationsRoleAssignments({
  organizationId,
  userId = null,
} = {}) {
  requireValue(organizationId, "organizationId");
  await ensureCanonicalOperationsRoles(organizationId);

  let query = supabaseAdmin
    .from("user_operations_roles")
    .select("id, organization_id, user_id, role_id, assigned_by, assigned_at, revoked_at")
    .eq("organization_id", organizationId)
    .is("revoked_at", null)
    .order("assigned_at", { ascending: false });

  if (userId) query = query.eq("user_id", userId);

  const [{ data: assignments, error }, roles] = await Promise.all([
    query,
    listRoles(organizationId),
  ]);

  if (error) throw error;

  const rolesById = new Map(roles.map((role) => [String(role.id), role]));
  return (assignments || []).map((assignment) => ({
    ...assignment,
    operations_role: rolesById.get(String(assignment.role_id)) || null,
  }));
}

export async function resolveUserOperationsPermissions({ organizationId, userId } = {}) {
  requireValue(organizationId, "organizationId");
  requireValue(userId, "userId");

  const assignments = await listUserOperationsRoleAssignments({ organizationId, userId });
  const roleIds = assignments.map((assignment) => assignment.role_id).filter(Boolean);
  if (!roleIds.length) return [];

  const { data, error } = await supabaseAdmin
    .from("operations_role_permissions")
    .select("permission_key")
    .eq("organization_id", organizationId)
    .in("role_id", roleIds);

  if (error) throw error;
  return [...new Set((data || []).map((row) => row.permission_key).filter(Boolean))];
}

export async function assignOperationsRole({
  organizationId,
  userId,
  roleCode,
  assignedBy,
} = {}) {
  requireValue(organizationId, "organizationId");
  requireValue(userId, "userId");
  requireValue(roleCode, "roleCode");
  requireValue(assignedBy, "assignedBy");

  const roles = await ensureCanonicalOperationsRoles(organizationId);
  const role = roles.find((candidate) => candidate.role_code === roleCode);
  if (!role || !role.is_active) throw new Error("Operations role not found or inactive");

  const { data, error } = await supabaseAdmin
    .from("user_operations_roles")
    .upsert({
      organization_id: organizationId,
      user_id: userId,
      role_id: role.id,
      assigned_by: assignedBy,
      assigned_at: new Date().toISOString(),
      revoked_at: null,
    }, {
      onConflict: "organization_id,user_id,role_id",
    })
    .select("id, organization_id, user_id, role_id, assigned_by, assigned_at, revoked_at")
    .single();

  if (error) throw error;
  return { ...data, operations_role: role };
}

export async function revokeOperationsRole({
  organizationId,
  userId,
  roleCode,
} = {}) {
  requireValue(organizationId, "organizationId");
  requireValue(userId, "userId");
  requireValue(roleCode, "roleCode");

  const roles = await ensureCanonicalOperationsRoles(organizationId);
  const role = roles.find((candidate) => candidate.role_code === roleCode);
  if (!role) throw new Error("Operations role not found");

  const { data, error } = await supabaseAdmin
    .from("user_operations_roles")
    .update({ revoked_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("role_id", role.id)
    .is("revoked_at", null)
    .select("id, organization_id, user_id, role_id, assigned_by, assigned_at, revoked_at");

  if (error) throw error;
  return data || [];
}

export default Object.freeze({
  CANONICAL_OPERATIONS_ROLES,
  ensureCanonicalOperationsRoles,
  listOperationsRoles,
  listUserOperationsRoleAssignments,
  resolveUserOperationsPermissions,
  assignOperationsRole,
  revokeOperationsRole,
});
