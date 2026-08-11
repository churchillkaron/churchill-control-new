import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { calculateMonthlyPayroll } from "@/lib/payroll/consolidation/generateMonthlyPayroll";
import buildPayrollReadiness from "@/lib/payroll/readiness/buildPayrollReadiness";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  resolveOrganizationTimeContext,
  zonedDateTimeToUtc,
} from "@/lib/shared/time/organizationTime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PREVIEW_ROLES = new Set([
  "OWNER",
  "SUPER_ADMIN",
  "MANAGER",
  "ACCOUNTING",
  "ACCOUNTING_ADMIN",
  "PAYROLL_ADMIN",
  "HR_ADMIN",
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

async function resolveEntityId({ organizationId, requestedEntityId }) {
  let query = supabaseAdmin
    .from("legal_entities")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  if (requestedEntityId) {
    query = query.eq("id", requestedEntityId);
  } else {
    query = query.eq("is_default_accounting_entity", true).limit(1);
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data?.id || null;
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

function summarize(records) {
  return (records || []).reduce(
    (summary, row) => ({
      staffCount: summary.staffCount + 1,
      grossSalary: summary.grossSalary + Number(row.gross_salary || 0),
      deductions: summary.deductions + Number(row.deductions || 0),
      finalSalary: summary.finalSalary + Number(row.final_salary || 0),
      overtimePay: summary.overtimePay + Number(row.overtime_pay || 0),
      serviceCharge: summary.serviceCharge + Number(row.service_charge_bonus || 0),
      reviewRequired: summary.reviewRequired + (row.review_required ? 1 : 0),
    }),
    {
      staffCount: 0,
      grossSalary: 0,
      deductions: 0,
      finalSalary: 0,
      overtimePay: 0,
      serviceCharge: 0,
      reviewRequired: 0,
    }
  );
}

export async function POST(request) {
  try {
    const body = await request.json();
    const requestedOrganizationId = String(
      body?.organizationId || body?.organization_id || ""
    ).trim() || null;
    const context = await resolveAuthenticatedStaffContext({
      request,
      organizationId: requestedOrganizationId,
    });

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
    if (!PREVIEW_ROLES.has(role)) {
      return NextResponse.json(
        { success: false, error: "Payroll preview permission required" },
        { status: 403 }
      );
    }

    const payrollMonth = String(body?.payrollMonth || "").trim();
    if (!/^\d{4}-\d{2}$/.test(payrollMonth)) {
      return NextResponse.json(
        { success: false, error: "payrollMonth must use YYYY-MM format" },
        { status: 400 }
      );
    }

    const entityId = await resolveEntityId({
      organizationId: context.organizationId,
      requestedEntityId: body?.entityId || null,
    });

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

    if (payrollMonth > readiness.currentMonth) {
      return NextResponse.json(
        {
          success: false,
          code: "FUTURE_PAYROLL_PREVIEW_NOT_ALLOWED",
          error: "Future payroll months cannot be previewed.",
          readiness,
        },
        { status: 409 }
      );
    }

    if (pendingAttendanceReviews.length > 0) {
      return NextResponse.json(
        {
          success: false,
          code: "ATTENDANCE_REVIEW_REQUIRED",
          error: "Attendance review is required before payroll preview.",
          pendingAttendanceReviews: pendingAttendanceReviews.length,
          readiness,
        },
        { status: 409 }
      );
    }

    const previewBlockers = (readiness.blockers || []).filter(
      (item) => item.code !== "PAYROLL_PERIOD_OPEN"
    );

    if (previewBlockers.length > 0) {
      return NextResponse.json(
        {
          success: false,
          code: "PAYROLL_PREVIEW_NOT_READY",
          error: "Payroll inputs are not ready for preview.",
          readiness,
          blockers: previewBlockers,
        },
        { status: 409 }
      );
    }

    const preview = await calculateMonthlyPayroll({
      organizationId: context.organizationId,
      entityId,
      payrollMonth,
    });

    return NextResponse.json({
      success: true,
      role,
      readiness,
      preview: {
        organizationId: preview.organizationId,
        entityId: preview.entityId,
        payrollMonth: preview.payrollMonth,
        timezone: preview.timezone,
        totalServiceCharge: preview.totalServiceCharge,
        summary: summarize(preview.records),
        records: preview.records,
        persisted: false,
      },
    });
  } catch (error) {
    console.error("PAYROLL_PREVIEW_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to preview payroll",
      },
      { status: 500 }
    );
  }
}
