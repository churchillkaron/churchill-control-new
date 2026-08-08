export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MANAGE_ROLES = new Set([
  "OWNER",
  "SUPER_ADMIN",
  "MANAGER",
  "PAYROLL_ADMIN",
  "ACCOUNTING_ADMIN",
]);

function normalizeRole(value) {
  return String(value || "").trim().toUpperCase();
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function context(request) {
  const user = await getServerCurrentUser();

  if (!user) {
    return {
      response: NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      ),
    };
  }

  const { data: staff, error: staffError } = await supabaseAdmin
    .from("staff_accounts")
    .select("id,name,email,role,active_organization_id,active")
    .eq("auth_user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (staffError) throw staffError;

  if (!staff?.active_organization_id) {
    return {
      response: NextResponse.json(
        { success: false, error: "Active organization not found" },
        { status: 403 }
      ),
    };
  }

  const access = await requireOrganizationAccess({
    organizationId: staff.active_organization_id,
    request,
  });

  if (!access.success) {
    return {
      response: NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 }
      ),
    };
  }

  const role = normalizeRole(access.role || staff.role);

  if (!MANAGE_ROLES.has(role)) {
    return {
      response: NextResponse.json(
        { success: false, error: "Compensation management permission required" },
        { status: 403 }
      ),
    };
  }

  return {
    staff,
    role,
    organizationId: staff.active_organization_id,
  };
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
    const bankName = String(body?.bankName || "").trim();
    const bankAccount = String(body?.bankAccount || "").trim();

    if (!staffId || !bankName || !bankAccount) {
      return NextResponse.json(
        { success: false, error: "staffId, bankName and bankAccount are required" },
        { status: 400 }
      );
    }

    const { data: employee, error: staffError } = await supabaseAdmin
      .from("staff_accounts")
      .select("id")
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

    const date = today();

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("employee_compensation_profiles")
      .select("id")
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

    const { data: updated, error: updateError } = await supabaseAdmin
      .from("employee_compensation_profiles")
      .update({
        bank_name: bankName,
        bank_account: bankAccount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profile.id)
      .eq("organization_id", ctx.organizationId)
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
