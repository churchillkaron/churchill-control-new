import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import {
  buildPayrollReadiness,
  generateMonthlyPayroll,
} from "@/lib/people/payroll";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveOrganizationTimeContext,
  zonedDateTimeToUtc,
} from "@/lib/shared/time/organizationTime";

const GENERATE_ROLES = new Set([
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

function monthRange(payrollMonth) {
  const start = `${payrollMonth}-01`;
  const end = new Date(`${start}T00:00:00.000Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end: end.toISOString().slice(0, 10) };
}

async function loadPendingAttendanceReviews({ organizationId, payrollMonth }) {
  const range = monthRange(payrollMonth);
  const timeContext = await resolveOrganizationTimeContext({ organizationId });
  const rangeStart = zonedDateTimeToUtc({
    date: range.start,
    time: "00:00:00",
    timezone: timeContext.timezone,
  });
  const rangeEnd = zonedDateTimeToUtc({
    date: range.end,
    time: "00:00:00",
    timezone: timeContext.timezone,
  });

  const { data, error } = await supabaseAdmin
    .from("staff_shifts")
    .select("id,staff_id,staff_name,clock_in,shift_source,approval_status")
    .eq("organization_id", organizationId)
    .eq("approval_status", "PENDING")
    .gte("clock_in", rangeStart.toISOString())
    .lt("clock_in", rangeEnd.toISOString());

  if (error) throw error;
  return data || [];
}

export async function POST(request) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request });

    if (!context.success) {
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

    const role = normalizeRole(context.role || context.staff?.role);

    if (!GENERATE_ROLES.has(role)) {
      return NextResponse.json(
        { success: false, error: "Payroll generation permission required" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const payrollMonth = String(body?.payrollMonth || "").trim();

    if (!/^\d{4}-\d{2}$/.test(payrollMonth)) {
      return NextResponse.json(
        { success: false, error: "payrollMonth must use YYYY-MM format" },
        { status: 400 }
      );
    }

    let entityId = body?.entityId || null;

    if (entityId) {
      const { data: entity, error: entityError } = await supabaseAdmin
        .from("legal_entities")
        .select("id")
        .eq("id", entityId)
        .eq("organization_id", context.organizationId)
        .eq("is_active", true)
        .maybeSingle();

      if (entityError) throw entityError;

      if (!entity) {
        return NextResponse.json(
          { success: false, error: "Legal entity does not belong to organization" },
          { status: 400 }
        );
      }
    } else {
      const { data: entity, error: entityError } = await supabaseAdmin
        .from("legal_entities")
        .select("id")
        .eq("organization_id", context.organizationId)
        .eq("is_active", true)
        .eq("is_default_accounting_entity", true)
        .limit(1)
        .maybeSingle();

      if (entityError) throw entityError;
      entityId = entity?.id || null;
    }

    if (!entityId) {
      return NextResponse.json(
        { success: false, error: "Default legal entity not configured" },
        { status: 400 }
      );
    }

    const [readiness, pendingAttendanceReviews] = await Promise.all([
      buildPayrollReadiness({
        organizationId: context.organizationId,
        entityId,
        payrollMonth,
      }),
      loadPendingAttendanceReviews({
        organizationId: context.organizationId,
        payrollMonth,
      }),
    ]);

    if (pendingAttendanceReviews.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Attendance review is required before payroll generation",
          code: "ATTENDANCE_REVIEW_REQUIRED",
          pendingAttendanceReviews: pendingAttendanceReviews.length,
          readiness,
        },
        { status: 409 }
      );
    }

    if (!readiness.canGenerate) {
      return NextResponse.json(
        {
          success: false,
          error: "Payroll is not ready to generate",
          code: "PAYROLL_NOT_READY",
          readiness,
        },
        { status: 409 }
      );
    }

    const result = await generateMonthlyPayroll({
      organizationId: context.organizationId,
      entityId,
      payrollMonth,
      requestedBy: context.staff.id,
    });

    return NextResponse.json({
      success: true,
      readiness,
      result,
    });
  } catch (error) {
    console.error("PAYROLL_GENERATE_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to generate payroll",
      },
      { status: 500 }
    );
  }
}
