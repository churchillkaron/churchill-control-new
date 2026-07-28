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

const ALL_FINANCE_PERMISSIONS = Object.freeze([
  "finance.view",
  "finance.accounting.view",
  "finance.accounting.manage",
  "finance.journals.create",
  "finance.journals.post",
  "finance.journals.reverse",
  "finance.receivables.view",
  "finance.receivables.manage",
  "finance.payables.view",
  "finance.payables.manage",
  "finance.banking.view",
  "finance.banking.manage",
  "finance.tax.view",
  "finance.tax.manage",
  "finance.reports.view",
  "finance.reports.manage",
  "finance.close.execute",
  "finance.configuration.manage",
  "finance.permissions.view",
  "finance.permissions.grant",
]);

const ROLE_PERMISSION_BUNDLES = Object.freeze({
  FINANCE_ADMIN: ALL_FINANCE_PERMISSIONS,
  FINANCE_MANAGER: ALL_FINANCE_PERMISSIONS.filter(
    (permission) => permission !== "finance.permissions.grant"
  ),
  ACCOUNTANT: [
    "finance.view",
    "finance.accounting.view",
    "finance.accounting.manage",
    "finance.journals.create",
    "finance.journals.post",
    "finance.receivables.view",
    "finance.receivables.manage",
    "finance.payables.view",
    "finance.payables.manage",
    "finance.banking.view",
    "finance.tax.view",
    "finance.reports.view",
  ],
  ACCOUNTS_RECEIVABLE: [
    "finance.view",
    "finance.receivables.view",
    "finance.receivables.manage",
    "finance.reports.view",
  ],
  ACCOUNTS_PAYABLE: [
    "finance.view",
    "finance.payables.view",
    "finance.payables.manage",
    "finance.banking.view",
    "finance.reports.view",
  ],
  FINANCE_AUDITOR: [
    "finance.view",
    "finance.accounting.view",
    "finance.receivables.view",
    "finance.payables.view",
    "finance.banking.view",
    "finance.tax.view",
    "finance.reports.view",
    "finance.permissions.view",
  ],
  FINANCE_VIEWER: [
    "finance.view",
    "finance.accounting.view",
    "finance.receivables.view",
    "finance.payables.view",
    "finance.banking.view",
    "finance.tax.view",
    "finance.reports.view",
  ],
});

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

async function ensureCanonicalRoleRecords(organizationId) {
  const current = await readFinanceRoles(organizationId);
  const existingCodes = new Set(current.map((role) => role.role_code));
  const missingRoles = CANONICAL_FINANCE_ROLES.filter(
    (role) => !existingCodes.has(role.role_code)
  );

  if (missingRoles.length) {
    const { error } = await supabaseAdmin
      .from("finance_roles")
      .insert(
        missingRoles.map((role) => ({
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
  }

  return await readFinanceRoles(organizationId);
}

async function ensureCanonicalRolePermissions(organizationId, roles) {
  const { data: existing, error } = await supabaseAdmin
    .from("finance_permissions")
    .select("role_id, permission_key")
    .eq("organization_id", organizationId)
    .not("role_id", "is", null);

  if (error) throw error;

  const existingKeys = new Set(
    (existing || []).map(
      (permission) => `${permission.role_id}:${permission.permission_key}`
    )
  );
  const missing = [];

  for (const role of roles) {
    const permissions = ROLE_PERMISSION_BUNDLES[role.role_code] || [];

    for (const permissionKey of permissions) {
      const key = `${role.id}:${permissionKey}`;

      if (!existingKeys.has(key)) {
        missing.push({
          organization_id: organizationId,
          role_id: role.id,
          permission_key: permissionKey,
        });
      }
    }
  }

  if (missing.length) {
    const { error: insertError } = await supabaseAdmin
      .from("finance_permissions")
      .insert(missing);

    if (insertError && String(insertError.code || "") !== "23505") {
      throw insertError;
    }
  }
}

async function ensureCanonicalFinanceRoles(organizationId) {
  const roles = await ensureCanonicalRoleRecords(organizationId);
  await ensureCanonicalRolePermissions(organizationId, roles);
  return roles;
}

export async function listFinancePermissions(organizationId) {
  requireOrganizationId(organizationId);
  await ensureCanonicalFinanceRoles(organizationId);

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

  const roles = await listFinanceRoles(organizationId);
  const { data: permissions, error: permissionError } = await supabaseAdmin
    .from("finance_permissions")
    .select("id, organization_id, role_id, permission_key, created_at")
    .eq("organization_id", organizationId)
    .not("role_id", "is", null)
    .order("created_at", { ascending: false });

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
  const userIds = [...new Set((assignments || []).map((row) => row.user_id).filter(Boolean))];
  let staff = [];

  if (userIds.length) {
    const { data, error: staffError } = await supabaseAdmin
      .from("staff_accounts")
      .select("auth_user_id, name, email, position, department, party_id")
      .in("auth_user_id", userIds);

    if (staffError) throw staffError;
    staff = data || [];
  }

  const staffByUserId = new Map(
    staff.map((row) => [String(row.auth_user_id), row])
  );

  return (assignments || []).map((assignment) => {
    const role = rolesById.get(String(assignment.role_id)) || null;
    const person = staffByUserId.get(String(assignment.user_id)) || null;

    return {
      ...assignment,
      role_code: role?.role_code || null,
      role_name: role?.role_name || null,
      user_name: person?.name || person?.email || assignment.user_id,
      user_email: person?.email || null,
      finance_role: role,
    };
  });
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

  const roles = await listFinanceRoles(organizationId);
  const role = roles.find((candidate) => String(candidate.id) === String(roleId));

  if (!role) throw new Error("Finance role not found");

  const { data: staff, error: staffError } = await supabaseAdmin
    .from("staff_accounts")
    .select("id, auth_user_id, active_organization_id, active")
    .eq("auth_user_id", userId)
    .eq("active", true);

  if (staffError) throw staffError;

  const staffIds = (staff || []).map((row) => row.id);
  const directlyScoped = (staff || []).some(
    (row) => String(row.active_organization_id) === String(organizationId)
  );
  let membershipScoped = false;

  if (!directlyScoped && staffIds.length) {
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("organization_users")
      .select("id")
      .eq("organization_id", organizationId)
      .in("staff_account_id", staffIds)
      .limit(1)
      .maybeSingle();

    if (membershipError) throw membershipError;
    membershipScoped = Boolean(membership);
  }

  if (!directlyScoped && !membershipScoped) {
    throw new Error("Staff member does not belong to this organisation");
  }

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("user_finance_roles")
    .select("id, user_id, role_id, assigned_by, assigned_at, organization_id")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("role_id", roleId)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing) {
    return {
      ...existing,
      role_code: role.role_code,
      role_name: role.role_name,
      already_assigned: true,
    };
  }

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

  return {
    ...data,
    role_code: role.role_code,
    role_name: role.role_name,
    already_assigned: false,
  };
}
