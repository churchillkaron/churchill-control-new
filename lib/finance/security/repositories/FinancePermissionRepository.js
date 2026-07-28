import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const CANONICAL_FINANCE_ROLES = Object.freeze([
  {
    role_code: "FINANCE_ADMIN",
    role_name: "Finance Administrator",
    description: "Full Finance configuration, control and transaction authority.",
  },
  {
    role_code: "FINANCE_MANAGER",
    role_name: "Finance Manager",
    description: "Manage Finance operations, approvals, reporting and close activities.",
  },
  {
    role_code: "ACCOUNTANT",
    role_name: "Accountant",
    description: "Create and manage accounting records, journals and reconciliations.",
  },
  {
    role_code: "ACCOUNTS_RECEIVABLE",
    role_name: "Accounts Receivable",
    description: "Manage customer invoices, receipts, statements and collections.",
  },
  {
    role_code: "ACCOUNTS_PAYABLE",
    role_name: "Accounts Payable",
    description: "Manage vendor bills, payments, statements and payable controls.",
  },
  {
    role_code: "FINANCE_AUDITOR",
    role_name: "Finance Auditor",
    description: "Review Finance records, reports, controls and audit evidence.",
  },
  {
    role_code: "FINANCE_VIEWER",
    role_name: "Finance Viewer",
    description: "Read-only access to authorised Finance records and reports.",
  },
]);

function requireOrganizationId(organizationId) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }
}

function uniqueByPermissionKey(rows) {
  const seen = new Set();

  return (rows || []).filter((row) => {
    const key = row.permission_key;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function readFinanceRoles(organizationId) {
  const { data, error } = await supabaseAdmin
    .from("finance_roles")
    .select("id, organization_id, role_code, role_name, description, is_active, created_at")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("role_name", { ascending: true });

  if (error) throw error;

  return data || [];
}

async function ensureCanonicalFinanceRoles(organizationId) {
  const current = await readFinanceRoles(organizationId);

  if (current.length) {
    return current;
  }

  const { error } = await supabaseAdmin
    .from("finance_roles")
    .insert(
      CANONICAL_FINANCE_ROLES.map((role) => ({
        organization_id: organizationId,
        role_code: role.role_code,
        role_name: role.role_name,
        description: role.description,
        is_active: true,
      }))
    );

  if (error && String(error.code || "") !== "23505") {
    throw error;
  }

  return await readFinanceRoles(organizationId);
}

export async function listFinancePermissions(organizationId) {
  requireOrganizationId(organizationId);

  const { data, error } = await supabaseAdmin
    .from("finance_permissions")
    .select("id, organization_id, role_id, permission_key, created_at")
    .eq("organization_id", organizationId)
    .order("permission_key", { ascending: true });

  if (error) throw error;

  return uniqueByPermissionKey(data || []);
}

export async function listFinanceRoles(organizationId) {
  requireOrganizationId(organizationId);
  return await ensureCanonicalFinanceRoles(organizationId);
}

export async function listFinancePermissionGrants(organizationId) {
  requireOrganizationId(organizationId);

  const [{ data: permissions, error: permissionError }, roles] = await Promise.all([
    supabaseAdmin
      .from("finance_permissions")
      .select("id, organization_id, role_id, permission_key, created_at")
      .eq("organization_id", organizationId)
      .not("role_id", "is", null)
      .order("created_at", { ascending: false }),
    listFinanceRoles(organizationId),
  ]);

  if (permissionError) throw permissionError;

  const rolesById = new Map(roles.map((role) => [String(role.id), role]));

  return (permissions || []).map((permission) => {
    const role = rolesById.get(String(permission.role_id)) || null;

    return {
      id: permission.id,
      organization_id: permission.organization_id,
      role_id: permission.role_id,
      role_code: role?.role_code || null,
      role_name: role?.role_name || null,
      permission_id: permission.id,
      permission_key: permission.permission_key,
      granted_by: null,
      granted_at: permission.created_at,
    };
  });
}

export async function listUserFinanceRoles({ organizationId, userId = null }) {
  requireOrganizationId(organizationId);

  let query = supabaseAdmin
    .from("user_finance_roles")
    .select("id, user_id, role_id, assigned_by, assigned_at, organization_id")
    .eq("organization_id", organizationId)
    .order("assigned_at", { ascending: false });

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const [{ data: assignments, error }, roles] = await Promise.all([
    query,
    listFinanceRoles(organizationId),
  ]);

  if (error) throw error;

  const rolesById = new Map(roles.map((role) => [String(role.id), role]));

  return (assignments || []).map((assignment) => ({
    ...assignment,
    finance_role: rolesById.get(String(assignment.role_id)) || null,
  }));
}

export async function grantFinancePermissionRecord({
  organizationId,
  roleId,
  permissionKey,
  grantedBy,
}) {
  requireOrganizationId(organizationId);

  if (!roleId) throw new Error("roleId required");
  if (!permissionKey) throw new Error("permissionKey required");
  if (!grantedBy) throw new Error("grantedBy required");

  const { data: role, error: roleError } = await supabaseAdmin
    .from("finance_roles")
    .select("id, role_code, role_name")
    .eq("organization_id", organizationId)
    .eq("id", roleId)
    .eq("is_active", true)
    .maybeSingle();

  if (roleError) throw roleError;
  if (!role) throw new Error("Finance role not found");

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("finance_permissions")
    .select("id, organization_id, role_id, permission_key, created_at")
    .eq("organization_id", organizationId)
    .eq("role_id", roleId)
    .eq("permission_key", permissionKey)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing) {
    return {
      ...existing,
      role_code: role.role_code,
      role_name: role.role_name,
      already_granted: true,
    };
  }

  const { data, error } = await supabaseAdmin
    .from("finance_permissions")
    .insert({
      organization_id: organizationId,
      role_id: roleId,
      permission_key: permissionKey,
    })
    .select("id, organization_id, role_id, permission_key, created_at")
    .single();

  if (error) throw error;

  return {
    ...data,
    role_code: role.role_code,
    role_name: role.role_name,
    granted_by: grantedBy,
    granted_at: data.created_at,
    already_granted: false,
  };
}

export async function assignFinanceRoleRecord({
  organizationId,
  userId,
  roleId,
  assignedBy,
}) {
  requireOrganizationId(organizationId);

  if (!userId) throw new Error("userId required");
  if (!roleId) throw new Error("roleId required");
  if (!assignedBy) throw new Error("assignedBy required");

  const { data: role, error: roleError } = await supabaseAdmin
    .from("finance_roles")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("id", roleId)
    .eq("is_active", true)
    .maybeSingle();

  if (roleError) throw roleError;
  if (!role) throw new Error("Finance role not found");

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("user_finance_roles")
    .select("id, user_id, role_id, assigned_by, assigned_at, organization_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("role_id", roleId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) return existing;

  const { data, error } = await supabaseAdmin
    .from("user_finance_roles")
    .insert({
      organization_id: organizationId,
      user_id: userId,
      role_id: roleId,
      assigned_by: assignedBy,
      assigned_at: new Date().toISOString(),
    })
    .select("id, user_id, role_id, assigned_by, assigned_at, organization_id")
    .single();

  if (error) throw error;

  return data;
}
