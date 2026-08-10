export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import activateStaffPortalAccess, {
  staffPortalAccessStatus,
} from "@/lib/people/identity/activateStaffPortalAccess";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MANAGE_ROLES = new Set([
  "OWNER",
  "SUPER_ADMIN",
  "MANAGER",
  "HR_ADMIN",
  "PAYROLL_ADMIN",
]);

function normalizeRole(value) {
  return String(value || "").trim().toUpperCase();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function contextResponse(context) {
  return NextResponse.json(
    {
      success: false,
      error: context.error,
      code: context.code,
      availableOrganizationIds: context.availableOrganizationIds || [],
    },
    { status: context.status || 403 }
  );
}

async function managementContext(request) {
  const resolved = await resolveAuthenticatedStaffContext({ request });

  if (!resolved.success) {
    return { response: contextResponse(resolved) };
  }

  const role = normalizeRole(resolved.role || resolved.staff?.role);

  if (!MANAGE_ROLES.has(role)) {
    return {
      response: NextResponse.json(
        { success: false, error: "Staff management permission required" },
        { status: 403 }
      ),
    };
  }

  return {
    role,
    staff: resolved.staff,
    organizationId: resolved.organizationId,
  };
}

function compensationConfigured(profile) {
  if (!profile) return false;

  const salaryType = normalizeRole(profile.salary_type);
  const monthlySalary = Number(profile.monthly_salary || 0);
  const hourlyRate = Number(profile.hourly_rate || 0);

  if (salaryType === "HOURLY") return hourlyRate > 0;
  if (salaryType === "MONTHLY") return monthlySalary > 0;

  return monthlySalary > 0 || hourlyRate > 0;
}

function resolveRedirectOrigin(request) {
  const configuredOrigin = String(process.env.NEXT_PUBLIC_APP_URL || "").trim();

  if (configuredOrigin) {
    try {
      return new URL(configuredOrigin).origin;
    } catch {
      // Fall back to the current request origin.
    }
  }

  return new URL(request.url).origin;
}

async function authUsersById(authUserIds) {
  const entries = await Promise.all(
    [...new Set(authUserIds.filter(Boolean))].map(async (authUserId) => {
      const { data, error } = await supabaseAdmin.auth.admin.getUserById(authUserId);

      if (error || !data?.user) return [authUserId, null];
      return [authUserId, data.user];
    })
  );

  return new Map(entries);
}

export async function GET(request) {
  try {
    const ctx = await managementContext(request);
    if (ctx.response) return ctx.response;

    const date = today();

    const [staffResult, compensationResult] = await Promise.all([
      supabaseAdmin
        .from("staff_accounts")
        .select(
          "id,name,email,role,position,department,party_id,auth_user_id,active,active_organization_id"
        )
        .eq("active_organization_id", ctx.organizationId)
        .eq("active", true)
        .order("name", { ascending: true }),
      supabaseAdmin
        .from("employee_compensation_profiles")
        .select(
          "id,organization_id,entity_id,party_id,staff_account_id,effective_from,effective_to,salary_type,payroll_frequency,currency,monthly_salary,hourly_rate,overtime_eligible,tax_exempt,social_security_enabled,pension_rate,bank_name,bank_account"
        )
        .eq("organization_id", ctx.organizationId)
        .lte("effective_from", date)
        .or(`effective_to.is.null,effective_to.gte.${date}`)
        .order("effective_from", { ascending: false }),
    ]);

    if (staffResult.error) throw staffResult.error;
    if (compensationResult.error) throw compensationResult.error;

    const staffRows = staffResult.data || [];
    const authUsers = await authUsersById(
      staffRows.map((staff) => staff.auth_user_id)
    );

    const compensationByStaff = new Map();

    for (const profile of compensationResult.data || []) {
      if (!compensationByStaff.has(profile.staff_account_id)) {
        compensationByStaff.set(profile.staff_account_id, profile);
      }
    }

    const employees = staffRows.map((staff) => {
      const authUser = staff.auth_user_id
        ? authUsers.get(staff.auth_user_id) || null
        : null;
      const compensation = compensationByStaff.get(staff.id) || null;

      return {
        ...staff,
        portalAccess: {
          status: staffPortalAccessStatus({ staff, authUser }),
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

    return NextResponse.json({
      success: true,
      organizationId: ctx.organizationId,
      role: ctx.role,
      employees,
      summary: {
        activeStaff: employees.length,
        setupRequired: employees.filter(
          (employee) => employee.portalAccess.status === "SETUP_REQUIRED"
        ).length,
        accountLinked: employees.filter(
          (employee) => employee.portalAccess.status === "ACCOUNT_LINKED"
        ).length,
        activePortal: employees.filter(
          (employee) => employee.portalAccess.status === "ACTIVE"
        ).length,
        compensationUnconfigured: employees.filter(
          (employee) => !employee.compensation?.configured
        ).length,
      },
    });
  } catch (error) {
    console.error("PEOPLE_DIRECTORY_LIST_ERROR", error);

    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load staff directory" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const ctx = await managementContext(request);
    if (ctx.response) return ctx.response;

    const body = await request.json();
    const staffId = String(body?.staffId || "").trim();
    const action = String(body?.action || "").trim().toLowerCase();

    if (!staffId) {
      return NextResponse.json(
        { success: false, error: "staffId required" },
        { status: 400 }
      );
    }

    if (action !== "send_activation") {
      return NextResponse.json(
        { success: false, error: "Unsupported staff management action" },
        { status: 400 }
      );
    }

    const redirectTo = new URL(
      "/login#type=recovery",
      resolveRedirectOrigin(request)
    ).toString();

    const activation = await activateStaffPortalAccess({
      staffId,
      organizationId: ctx.organizationId,
      redirectTo,
    });

    return NextResponse.json({
      success: true,
      activation,
      message: "Secure staff portal setup link sent.",
    });
  } catch (error) {
    console.error("PEOPLE_DIRECTORY_ACTION_ERROR", error);

    const message = error?.message || "Unable to update staff portal access";
    const status = message.includes("not found") ? 404 : 400;

    return NextResponse.json(
      { success: false, error: message },
      { status }
    );
  }
}
