export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import { getServerCurrentUser } from "@/lib/auth/getServerCurrentUser";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { approvePayrollRecord } from "@/lib/payroll/consolidation/approvePayrollRecord";
import rejectPayrollRecord from "@/lib/payroll/consolidation/rejectPayrollRecord";

const GOVERNANCE_ROLES = new Set([
  "OWNER",
  "SUPER_ADMIN",
  "MANAGER",
  "ACCOUNTING",
  "ACCOUNTING_ADMIN",
  "PAYROLL_ADMIN",
]);

function normalizeRole(value) {
  return String(value || "").trim().toUpperCase();
}

async function governanceContext(request) {
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

  if (!GOVERNANCE_ROLES.has(role)) {
    return {
      response: NextResponse.json(
        { success: false, error: "Payroll governance permission required" },
        { status: 403 }
      ),
    };
  }

  return {
    user,
    staff,
    role,
    organizationId: staff.active_organization_id,
  };
}

export async function GET(request) {
  try {
    const context = await governanceContext(request);
    if (context.response) return context.response;

    const { data, error } = await supabaseAdmin
      .from("payroll_records")
      .select("*")
      .eq("organization_id", context.organizationId)
      .order("payroll_month", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      role: context.role,
      payroll: data || [],
    });
  } catch (error) {
    console.error("PAYROLL_GOVERNANCE_LIST_ERROR", error);

    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load payroll governance" },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const context = await governanceContext(request);
    if (context.response) return context.response;

    const body = await request.json();
    const payrollRecordId = String(body?.payrollRecordId || "").trim();
    const action = String(body?.action || "").trim().toUpperCase();

    if (!payrollRecordId || !action) {
      return NextResponse.json(
        { success: false, error: "payrollRecordId and action are required" },
        { status: 400 }
      );
    }

    const actorName = context.staff.name || context.staff.email || context.role;

    let result;

    if (action === "APPROVE") {
      result = await approvePayrollRecord({
        payrollRecordId,
        organizationId: context.organizationId,
        approvedBy: context.staff.id,
        actorName,
        role: context.role,
      });
    } else if (action === "REJECT") {
      result = await rejectPayrollRecord({
        payrollRecordId,
        organizationId: context.organizationId,
        rejectedBy: context.staff.id,
        actorName,
        role: context.role,
        reason: body?.reason,
      });
    } else {
      return NextResponse.json(
        { success: false, error: "Unsupported payroll governance action" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("PAYROLL_GOVERNANCE_ACTION_ERROR", error);

    return NextResponse.json(
      { success: false, error: error?.message || "Unable to execute payroll action" },
      { status: 400 }
    );
  }
}
