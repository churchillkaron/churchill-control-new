export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MANAGE_ROLES = new Set([
  "OWNER",
  "SUPER_ADMIN",
  "MANAGER",
  "HR_ADMIN",
  "PAYROLL_ADMIN",
  "ACCOUNTING_ADMIN",
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

async function context(request) {
  const resolved = await resolveAuthenticatedStaffContext({ request });

  if (!resolved.success) {
    return { response: contextResponse(resolved) };
  }

  const role = normalizeRole(resolved.role || resolved.staff?.role);

  if (!MANAGE_ROLES.has(role)) {
    return {
      response: NextResponse.json(
        { success: false, error: "Compensation management permission required" },
        { status: 403 }
      ),
    };
  }

  return {
    staff: resolved.staff,
    role,
    organizationId: resolved.organizationId,
  };
}

function optionalText(body, key, { uppercase = false } = {}) {
  if (!Object.prototype.hasOwnProperty.call(body || {}, key)) return undefined;

  const value = String(body?.[key] ?? "").trim();
  return uppercase ? value.toUpperCase() : value;
}

function optionalNumber(body, key) {
  if (!Object.prototype.hasOwnProperty.call(body || {}, key)) return undefined;

  const raw = body?.[key];
  if (raw === "" || raw === null || typeof raw === "undefined") return 0;

  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${key} must be a non-negative number`);
  }

  return value;
}

export async function GET(request) {
  try {
    const ctx = await context(request);
    if (ctx.response) return ctx.response;

    const date = today();

    const [staffResult, profileResult] = await Promise.all([
      supabaseAdmin
        .from("staff_accounts")
        .select("id,name,email,role,position,department,party_id,active")
        .eq("active_organization_id", ctx.organizationId)
        .eq("active", true)
        .order("name", { ascending: true }),
      supabaseAdmin
        .from("employee_compensation_profiles")
        .select("*")
        .eq("organization_id", ctx.organizationId)
        .lte("effective_from", date)
        .or(`effective_to.is.null,effective_to.gte.${date}`)
        .order("effective_from", { ascending: false }),
    ]);

    if (staffResult.error) throw staffResult.error;
    if (profileResult.error) throw profileResult.error;

    const profileByStaff = new Map();

    for (const profile of profileResult.data || []) {
      if (!profileByStaff.has(profile.staff_account_id)) {
        profileByStaff.set(profile.staff_account_id, profile);
      }
    }

    const employees = (staffResult.data || []).map((employee) => ({
      ...employee,
      compensation: profileByStaff.get(employee.id) || null,
    }));

    return NextResponse.json({
      success: true,
      organizationId: ctx.organizationId,
      role: ctx.role,
      employees,
    });
  } catch (error) {
    console.error("COMPENSATION_LIST_ERROR", error);

    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load compensation profiles" },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    const ctx = await context(request);
    if (ctx.response) return ctx.response;

    const body = await request.json();
    const staffId = String(body?.staffId || "").trim();

    if (!staffId) {
      return NextResponse.json(
        { success: false, error: "staffId required" },
        { status: 400 }
      );
    }

    const bankName = optionalText(body, "bankName");
    const bankAccount = optionalText(body, "bankAccount");
    const salaryType = optionalText(body, "salaryType", { uppercase: true });
    const payrollFrequency = optionalText(body, "payrollFrequency", {
      uppercase: true,
    });
    const currency = optionalText(body, "currency", { uppercase: true });
    const monthlySalary = optionalNumber(body, "monthlySalary");
    const hourlyRate = optionalNumber(body, "hourlyRate");

    if (salaryType !== undefined && !["MONTHLY", "HOURLY"].includes(salaryType)) {
      return NextResponse.json(
        { success: false, error: "salaryType must be MONTHLY or HOURLY" },
        { status: 400 }
      );
    }

    if (payrollFrequency !== undefined && !payrollFrequency) {
      return NextResponse.json(
        { success: false, error: "payrollFrequency cannot be empty" },
        { status: 400 }
      );
    }

    if (currency !== undefined && !/^[A-Z]{3}$/.test(currency)) {
      return NextResponse.json(
        { success: false, error: "currency must be a 3-letter code" },
        { status: 400 }
      );
    }

    const updates = {};

    if (bankName !== undefined) updates.bank_name = bankName || null;
    if (bankAccount !== undefined) updates.bank_account = bankAccount || null;
    if (salaryType !== undefined) updates.salary_type = salaryType;
    if (payrollFrequency !== undefined) {
      updates.payroll_frequency = payrollFrequency;
    }
    if (currency !== undefined) updates.currency = currency;
    if (monthlySalary !== undefined) updates.monthly_salary = monthlySalary;
    if (hourlyRate !== undefined) updates.hourly_rate = hourlyRate;

    if (!Object.keys(updates).length) {
      return NextResponse.json(
        { success: false, error: "No compensation changes supplied" },
        { status: 400 }
      );
    }

    const { data: employee, error: staffError } = await supabaseAdmin
      .from("staff_accounts")
      .select("id,party_id")
      .eq("id", staffId)
      .eq("active_organization_id", ctx.organizationId)
      .eq("active", true)
      .maybeSingle();

    if (staffError) throw staffError;
    if (!employee) {
      return NextResponse.json(
        { success: false, error: "Employee not found in this organization" },
        { status: 404 }
      );
    }

    if (!employee.party_id) {
      return NextResponse.json(
        { success: false, error: "Employee Party identity is not configured" },
        { status: 409 }
      );
    }

    const date = today();

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("employee_compensation_profiles")
      .select("id,organization_id,entity_id,party_id,staff_account_id")
      .eq("organization_id", ctx.organizationId)
      .eq("staff_account_id", staffId)
      .lte("effective_from", date)
      .or(`effective_to.is.null,effective_to.gte.${date}`)
      .order("effective_from", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (profileError) throw profileError;
    if (!profile) {
      return NextResponse.json(
        { success: false, error: "Active compensation profile not found" },
        { status: 404 }
      );
    }

    if (!profile.entity_id) {
      return NextResponse.json(
        { success: false, error: "Compensation legal entity is not configured" },
        { status: 409 }
      );
    }

    if (profile.party_id !== employee.party_id) {
      return NextResponse.json(
        { success: false, error: "Compensation Party identity does not match employee" },
        { status: 409 }
      );
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("employee_compensation_profiles")
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id)
      .eq("organization_id", ctx.organizationId)
      .eq("entity_id", profile.entity_id)
      .eq("party_id", employee.party_id)
      .eq("staff_account_id", staffId)
      .select("*")
      .single();

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      compensation: updated,
    });
  } catch (error) {
    console.error("COMPENSATION_UPDATE_ERROR", error);

    return NextResponse.json(
      { success: false, error: error?.message || "Unable to update compensation profile" },
      { status: 400 }
    );
  }
}
