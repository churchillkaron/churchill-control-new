export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { approvePayrollRecord } from "@/lib/payroll/consolidation/approvePayrollRecord";
import rejectPayrollRecord from "@/lib/payroll/consolidation/rejectPayrollRecord";
import lockPayrollRecord from "@/lib/payroll/consolidation/lockPayrollRecord";

const GOVERNANCE_ROLES = new Set([
  "OWNER",
  "SUPER_ADMIN",
  "MANAGER",
  "ACCOUNTING",
  "ACCOUNTING_ADMIN",
  "PAYROLL_ADMIN",
]);

const LOCK_ROLES = new Set([
  "OWNER",
  "SUPER_ADMIN",
  "ACCOUNTING",
  "ACCOUNTING_ADMIN",
  "PAYROLL_ADMIN",
]);

function normalizeRole(value) {
  return String(value || "").trim().toUpperCase();
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

async function governanceContext(request) {
  const context = await resolveAuthenticatedStaffContext({ request });

  if (!context.success) {
    return { response: contextResponse(context) };
  }

  const role = normalizeRole(context.role || context.staff?.role);

  if (!GOVERNANCE_ROLES.has(role)) {
    return {
      response: NextResponse.json(
        { success: false, error: "Payroll governance permission required" },
        { status: 403 }
      ),
    };
  }

  return {
    user: context.user,
    staff: context.staff,
    role,
    organizationId: context.organizationId,
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
      capabilities: {
        canReview: true,
        canLock: LOCK_ROLES.has(context.role),
      },
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
    } else if (action === "LOCK") {
      if (!LOCK_ROLES.has(context.role)) {
        return NextResponse.json(
          { success: false, error: "Payroll lock permission required" },
          { status: 403 }
        );
      }

      result = await lockPayrollRecord({
        payrollRecordId,
        organizationId: context.organizationId,
        lockedBy: context.staff.id,
        actorName,
        role: context.role,
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
