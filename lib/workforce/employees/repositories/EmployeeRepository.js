import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function requireOrganizationId(organizationId) {
  if (!organizationId) throw new Error("organizationId required");
}

function isActive(row = {}) {
  if (row.active === false || row.is_active === false || row.enabled === false) {
    return false;
  }

  const status = String(row.status || "ACTIVE").trim().toUpperCase();
  return ![
    "INACTIVE",
    "DISABLED",
    "SUSPENDED",
    "TERMINATED",
    "ARCHIVED",
    "REVOKED",
  ].includes(status);
}

function displayName(row = {}) {
  return String(
    row.full_name ||
    row.name ||
    row.display_name ||
    row.email ||
    ""
  ).trim();
}

async function organizationMemberships(organizationId) {
  const { data, error } = await supabaseAdmin
    .from("organization_users")
    .select("*")
    .eq("organization_id", organizationId)
    .limit(5000);

  if (error) throw error;
  return (data || []).filter(isActive);
}

async function staffByIds(ids) {
  if (!ids.length) return [];

  const { data, error } = await supabaseAdmin
    .from("staff_accounts")
    .select("*")
    .in("id", ids)
    .limit(5000);

  if (error) throw error;
  return data || [];
}

async function staffByActiveOrganization(organizationId) {
  const { data, error } = await supabaseAdmin
    .from("staff_accounts")
    .select("*")
    .eq("active_organization_id", organizationId)
    .limit(5000);

  if (error) throw error;
  return data || [];
}

export const EmployeeRepository = {
  async list({ organizationId }) {
    requireOrganizationId(organizationId);

    const memberships = await organizationMemberships(organizationId);
    const membershipStaffIds = memberships
      .map((row) => row.staff_account_id)
      .filter(Boolean);

    const [membershipStaff, activeOrganizationStaff] = await Promise.all([
      staffByIds(membershipStaffIds),
      staffByActiveOrganization(organizationId),
    ]);

    const unique = new Map();
    for (const row of [...membershipStaff, ...activeOrganizationStaff]) {
      if (row?.id && isActive(row)) unique.set(String(row.id), row);
    }

    return [...unique.values()].sort((left, right) =>
      displayName(left).localeCompare(displayName(right))
    );
  },

  async get({ organizationId, employeeId }) {
    requireOrganizationId(organizationId);
    if (!employeeId) throw new Error("employeeId required");

    const { data: staff, error: staffError } = await supabaseAdmin
      .from("staff_accounts")
      .select("*")
      .eq("id", employeeId)
      .maybeSingle();

    if (staffError) throw staffError;
    if (!staff || !isActive(staff)) return null;

    const { data: membership, error: membershipError } = await supabaseAdmin
      .from("organization_users")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("staff_account_id", employeeId)
      .limit(1)
      .maybeSingle();

    if (membershipError) throw membershipError;

    const directOrganizationMatch =
      String(staff.active_organization_id || "") === String(organizationId);

    if ((!membership || !isActive(membership)) && !directOrganizationMatch) {
      return null;
    }

    return staff;
  },
};
