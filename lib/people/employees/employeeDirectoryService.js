import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { staffPortalAccessStatus } from "@/lib/people/identity/activateStaffPortalAccess";

const OWNER_LEVEL_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
]);

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeRole(value) {
  return normalizeText(value).toUpperCase();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function compensationConfigured(profile) {
  if (!profile) return false;

  const salaryType = normalizeRole(profile.salary_type);
  const monthlySalary = Number(profile.monthly_salary || 0);
  const hourlyRate = Number(profile.hourly_rate || 0);

  if (salaryType === "HOURLY") return hourlyRate > 0;
  if (salaryType === "MONTHLY") return monthlySalary > 0;

  return false;
}

async function authUsersById(authUserIds) {
  const uniqueIds = [...new Set((authUserIds || []).filter(Boolean))];
  if (!uniqueIds.length) return new Map();

  const entries = await Promise.all(
    uniqueIds.map(async (authUserId) => {
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(authUserId);
      if (error || !data?.user) return [authUserId, null];
      return [authUserId, data.user];
    })
  );

  return new Map(entries);
}

async function findStaffByEmail({ organizationId, email, excludeStaffId = null }) {
  let query = supabaseAdmin
    .from("staff_accounts")
    .select("id,name,email,active")
    .eq("active_organization_id", organizationId)
    .ilike("email", email)
    .limit(1);

  if (excludeStaffId) query = query.neq("id", excludeStaffId);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

async function loadParty({ organizationId, partyId }) {
  if (!partyId) return null;

  const { data, error } = await supabaseAdmin
    .from("parties")
    .select("id,organization_id,display_name,email,status")
    .eq("id", partyId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function ensureParty({ organizationId, name, email, partyId = null }) {
  const existingById = await loadParty({ organizationId, partyId });
  if (existingById) return { party: existingById, created: false };

  const { data: existingByEmail, error: emailError } = await supabaseAdmin
    .from("parties")
    .select("id,organization_id,display_name,email,status")
    .eq("organization_id", organizationId)
    .ilike("email", email)
    .limit(1)
    .maybeSingle();

  if (emailError) throw emailError;
  if (existingByEmail) return { party: existingByEmail, created: false };

  const { data: party, error } = await supabaseAdmin
    .from("parties")
    .insert({
      organization_id: organizationId,
      party_type: "person",
      display_name: name,
      email,
      status: "active",
    })
    .select("id,organization_id,display_name,email,status")
    .single();

  if (error) throw error;
  return { party, created: true };
}

async function ensureActiveEmployeeRelationship({ organizationId, partyId }) {
  const { data: active, error: activeError } = await supabaseAdmin
    .from("party_relationships")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("party_id", partyId)
    .eq("relationship_type", "employee")
    .eq("status", "active")
    .is("end_date", null)
    .limit(1)
    .maybeSingle();

  if (activeError) throw activeError;
  if (active) return active.id;

  const { data, error } = await supabaseAdmin
    .from("party_relationships")
    .insert({
      organization_id: organizationId,
      party_id: partyId,
      relationship_type: "employee",
      status: "active",
      start_date: today(),
      end_date: null,
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

async function closeEmployeeRelationships({ organizationId, partyId }) {
  if (!partyId) return;

  const { error } = await supabaseAdmin
    .from("party_relationships")
    .update({
      status: "inactive",
      end_date: today(),
    })
    .eq("organization_id", organizationId)
    .eq("party_id", partyId)
    .eq("relationship_type", "employee")
    .eq("status", "active")
    .is("end_date", null);

  if (error) throw error;
}

async function ensureMembership({ organizationId, staffAccountId, role = "STAFF" }) {
  const normalizedRole = normalizeRole(role) || "STAFF";

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("organization_users")
    .select("id,role,status")
    .eq("organization_id", organizationId)
    .eq("staff_account_id", staffAccountId)
    .limit(1)
    .maybeSingle();

  if (existingError) throw existingError;

  if (existing) {
    if (String(existing.status || "").toLowerCase() !== "active") {
      const { error } = await supabaseAdmin
        .from("organization_users")
        .update({ status: "active" })
        .eq("id", existing.id)
        .eq("organization_id", organizationId);

      if (error) throw error;
    }
    return existing.id;
  }

  const { data, error } = await supabaseAdmin
    .from("organization_users")
    .insert({
      organization_id: organizationId,
      staff_account_id: staffAccountId,
      role: normalizedRole.toLowerCase(),
      status: "active",
    })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

async function loadStaffForMutation({ organizationId, staffId }) {
  const { data, error } = await supabaseAdmin
    .from("staff_accounts")
    .select(
      "id,name,email,role,position,department,active,auth_user_id,party_id,active_organization_id"
    )
    .eq("id", staffId)
    .eq("active_organization_id", organizationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Employee not found in this organization");
  return data;
}

async function loadMembership({ organizationId, staffId }) {
  const { data, error } = await supabaseAdmin
    .from("organization_users")
    .select("id,role,status")
    .eq("organization_id", organizationId)
    .eq("staff_account_id", staffId)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function assertOwnerDeactivationSafe({ organizationId, staffId, staffRole }) {
  const membership = await loadMembership({ organizationId, staffId });
  const effectiveRole = normalizeRole(membership?.role || staffRole);
  if (!OWNER_LEVEL_ROLES.has(effectiveRole)) return;

  const { data: memberships, error: membershipError } = await supabaseAdmin
    .from("organization_users")
    .select("staff_account_id,role,status")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .limit(2000);

  if (membershipError) throw membershipError;

  const otherOwnerStaffIds = (memberships || [])
    .filter(
      (row) =>
        row.staff_account_id !== staffId &&
        OWNER_LEVEL_ROLES.has(normalizeRole(row.role))
    )
    .map((row) => row.staff_account_id)
    .filter(Boolean);

  if (!otherOwnerStaffIds.length) {
    throw new Error("The final organization owner cannot be deactivated");
  }
}

export async function loadEmployeeDirectory({ organizationId }) {
  if (!organizationId) throw new Error("organizationId required");

  const date = today();
  const [staffResult, compensationResult, membershipResult] = await Promise.all([
    supabaseAdmin
      .from("staff_accounts")
      .select(
        "id,name,email,role,position,department,party_id,auth_user_id,active,active_organization_id"
      )
      .eq("active_organization_id", organizationId)
      .order("active", { ascending: false })
      .order("name", { ascending: true }),
    supabaseAdmin
      .from("employee_compensation_profiles")
      .select(
        "id,organization_id,entity_id,party_id,staff_account_id,effective_from,effective_to,salary_type,payroll_frequency,currency,monthly_salary,hourly_rate,bank_name,bank_account"
      )
      .eq("organization_id", organizationId)
      .lte("effective_from", date)
      .or(`effective_to.is.null,effective_to.gte.${date}`)
      .order("effective_from", { ascending: false }),
    supabaseAdmin
      .from("organization_users")
      .select("id,staff_account_id,role,status")
      .eq("organization_id", organizationId)
      .limit(2000),
  ]);

  if (staffResult.error) throw staffResult.error;
  if (compensationResult.error) throw compensationResult.error;
  if (membershipResult.error) throw membershipResult.error;

  const staffRows = staffResult.data || [];
  const authUsers = await authUsersById(staffRows.map((row) => row.auth_user_id));
  const membershipByStaff = new Map(
    (membershipResult.data || []).map((row) => [String(row.staff_account_id), row])
  );
  const compensationByStaff = new Map();

  for (const profile of compensationResult.data || []) {
    if (!compensationByStaff.has(String(profile.staff_account_id))) {
      compensationByStaff.set(String(profile.staff_account_id), profile);
    }
  }

  const employees = staffRows.map((staff) => {
    const authUser = staff.auth_user_id
      ? authUsers.get(staff.auth_user_id) || null
      : null;
    const compensation = compensationByStaff.get(String(staff.id)) || null;
    const membership = membershipByStaff.get(String(staff.id)) || null;

    return {
      ...staff,
      accessRole: normalizeRole(membership?.role || staff.role) || "STAFF",
      membership: membership
        ? {
            id: membership.id,
            role: membership.role || null,
            status: membership.status || null,
          }
        : null,
      portalAccess: {
        status: staff.active === false
          ? "INACTIVE"
          : staffPortalAccessStatus({ staff, authUser }),
        lastSignInAt: authUser?.last_sign_in_at || null,
        emailConfirmedAt: authUser?.email_confirmed_at || null,
      },
      compensation: compensation
        ? {
            ...compensation,
            configured: compensationConfigured(compensation),
          }
        : null,
    };
  });

  const activeEmployees = employees.filter((employee) => employee.active !== false);

  return {
    employees,
    summary: {
      totalStaff: employees.length,
      activeStaff: activeEmployees.length,
      inactiveStaff: employees.length - activeEmployees.length,
      setupRequired: activeEmployees.filter(
        (employee) => employee.portalAccess.status === "SETUP_REQUIRED"
      ).length,
      accountLinked: activeEmployees.filter(
        (employee) => employee.portalAccess.status === "ACCOUNT_LINKED"
      ).length,
      activePortal: activeEmployees.filter(
        (employee) => employee.portalAccess.status === "ACTIVE"
      ).length,
      compensationUnconfigured: activeEmployees.filter(
        (employee) => !employee.compensation?.configured
      ).length,
    },
  };
}

export async function createEmployeeRecord({
  organizationId,
  name,
  email,
  position = null,
  department = null,
}) {
  const normalizedName = normalizeText(name);
  const normalizedEmail = normalizeEmail(email);
  const normalizedPosition = normalizeText(position) || null;
  const normalizedDepartment = normalizeText(department) || null;

  if (!organizationId) throw new Error("organizationId required");
  if (!normalizedName) throw new Error("Employee name is required");
  if (!normalizedEmail) throw new Error("Employee email is required");

  const duplicate = await findStaffByEmail({
    organizationId,
    email: normalizedEmail,
  });

  if (duplicate) {
    throw new Error(
      duplicate.active === false
        ? "An inactive employee with this email already exists. Reactivate that employee instead."
        : "An employee with this email already exists in this organization."
    );
  }

  const { party, created: partyCreated } = await ensureParty({
    organizationId,
    name: normalizedName,
    email: normalizedEmail,
  });

  try {
    const { data: staff, error } = await supabaseAdmin
      .from("staff_accounts")
      .insert({
        name: normalizedName,
        email: normalizedEmail,
        role: "STAFF",
        position: normalizedPosition,
        department: normalizedDepartment,
        active: true,
        active_organization_id: organizationId,
        party_id: party.id,
      })
      .select(
        "id,name,email,role,position,department,active,auth_user_id,party_id,active_organization_id"
      )
      .single();

    if (error) throw error;

    await ensureMembership({
      organizationId,
      staffAccountId: staff.id,
      role: "STAFF",
    });
    await ensureActiveEmployeeRelationship({
      organizationId,
      partyId: party.id,
    });

    return { staff, party };
  } catch (error) {
    if (partyCreated) {
      await supabaseAdmin
        .from("parties")
        .delete()
        .eq("id", party.id)
        .eq("organization_id", organizationId)
        .catch(() => null);
    }
    throw error;
  }
}

export async function updateEmployeeRecord({
  organizationId,
  staffId,
  name,
  email,
  position = null,
  department = null,
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!staffId) throw new Error("staffId required");

  const current = await loadStaffForMutation({ organizationId, staffId });
  const normalizedName = normalizeText(name);
  const normalizedEmail = normalizeEmail(email);
  const normalizedPosition = normalizeText(position) || null;
  const normalizedDepartment = normalizeText(department) || null;

  if (!normalizedName) throw new Error("Employee name is required");
  if (!normalizedEmail) throw new Error("Employee email is required");

  if (
    normalizeEmail(current.email) !== normalizedEmail &&
    current.auth_user_id
  ) {
    throw new Error(
      "Portal-linked employee email changes require an identity email-change workflow. Update the login identity before changing this employee email."
    );
  }

  const duplicate = await findStaffByEmail({
    organizationId,
    email: normalizedEmail,
    excludeStaffId: staffId,
  });
  if (duplicate) {
    throw new Error("Another employee already uses this email in this organization.");
  }

  let party = await loadParty({
    organizationId,
    partyId: current.party_id,
  });

  if (!party) {
    const ensured = await ensureParty({
      organizationId,
      name: normalizedName,
      email: normalizedEmail,
    });
    party = ensured.party;
  }

  const previousParty = {
    display_name: party.display_name || null,
    email: party.email || null,
  };

  const { error: partyError } = await supabaseAdmin
    .from("parties")
    .update({
      display_name: normalizedName,
      email: normalizedEmail,
      status: "active",
    })
    .eq("id", party.id)
    .eq("organization_id", organizationId);

  if (partyError) throw partyError;

  const { data: staff, error: staffError } = await supabaseAdmin
    .from("staff_accounts")
    .update({
      name: normalizedName,
      email: normalizedEmail,
      position: normalizedPosition,
      department: normalizedDepartment,
      party_id: party.id,
    })
    .eq("id", staffId)
    .eq("active_organization_id", organizationId)
    .select(
      "id,name,email,role,position,department,active,auth_user_id,party_id,active_organization_id"
    )
    .single();

  if (staffError) {
    await supabaseAdmin
      .from("parties")
      .update(previousParty)
      .eq("id", party.id)
      .eq("organization_id", organizationId)
      .catch(() => null);
    throw staffError;
  }

  await ensureActiveEmployeeRelationship({
    organizationId,
    partyId: party.id,
  });
  await ensureMembership({
    organizationId,
    staffAccountId: staff.id,
    role: current.role || "STAFF",
  });

  return { staff, party };
}

export async function setEmployeeActiveStatus({
  organizationId,
  staffId,
  active,
  actingStaffId = null,
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!staffId) throw new Error("staffId required");
  if (typeof active !== "boolean") throw new Error("active must be boolean");

  const current = await loadStaffForMutation({ organizationId, staffId });

  if (!active && actingStaffId && String(actingStaffId) === String(staffId)) {
    throw new Error("You cannot deactivate your own employee account");
  }

  if (!active) {
    await assertOwnerDeactivationSafe({
      organizationId,
      staffId,
      staffRole: current.role,
    });
  }

  const { data: staff, error: staffError } = await supabaseAdmin
    .from("staff_accounts")
    .update({ active })
    .eq("id", staffId)
    .eq("active_organization_id", organizationId)
    .select(
      "id,name,email,role,position,department,active,auth_user_id,party_id,active_organization_id"
    )
    .single();

  if (staffError) throw staffError;

  const membership = await loadMembership({ organizationId, staffId });
  if (membership) {
    const { error } = await supabaseAdmin
      .from("organization_users")
      .update({ status: active ? "active" : "inactive" })
      .eq("id", membership.id)
      .eq("organization_id", organizationId);

    if (error) throw error;
  } else if (active) {
    await ensureMembership({
      organizationId,
      staffAccountId: staff.id,
      role: current.role || "STAFF",
    });
  }

  if (active) {
    if (staff.party_id) {
      await ensureActiveEmployeeRelationship({
        organizationId,
        partyId: staff.party_id,
      });
    }
  } else {
    await closeEmployeeRelationships({
      organizationId,
      partyId: staff.party_id,
    });
  }

  return { staff };
}
