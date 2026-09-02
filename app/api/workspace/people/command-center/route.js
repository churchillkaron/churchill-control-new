export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { resolveBusinessContext } from "@/lib/business-context/resolveBusinessContext";
import { loadEmploymentCohort } from "@/lib/people/employees/employmentAssignmentService";
import { buildPayrollReadiness } from "@/lib/people/payroll";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  localDateString,
  partsInTimezone,
  resolveOrganizationTimeContext,
} from "@/lib/shared/time/organizationTime";

const OPEN_SCHEDULE_STATUSES = new Set(["open", "published", "scheduled"]);
const ATTENDANCE_EXCEPTION_STATUSES = new Set([
  "absent",
  "late",
  "missing",
  "missed",
  "no_show",
  "rejected",
]);
const PAYROLL_PERIOD_STATE_CODES = new Set(["PAYROLL_PERIOD_OPEN"]);

function clean(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return clean(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function titleCase(value) {
  return clean(value)
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function numeric(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function peopleHref(path) {
  const cleanPath = clean(path).replace(/^\/+/, "");
  return `/people/${cleanPath}`;
}

function minutesFromTime(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(clean(value));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function effectiveOn(row, date) {
  if (!row || !date) return false;
  if (row.effective_from && String(row.effective_from).slice(0, 10) > date) return false;
  if (row.effective_to && String(row.effective_to).slice(0, 10) < date) return false;
  return true;
}

function overlaps(row, date) {
  if (!row || !date) return false;
  return Boolean(
    row.start_date &&
      row.end_date &&
      String(row.start_date).slice(0, 10) <= date &&
      String(row.end_date).slice(0, 10) >= date,
  );
}

function latestByStaff(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (!row.staff_account_id) continue;
    if (!map.has(row.staff_account_id)) map.set(row.staff_account_id, row);
  }
  return map;
}

async function safe(source, task, fallback) {
  try {
    return {
      source,
      status: "connected",
      data: await task(),
      error: null,
    };
  } catch (error) {
    console.error("PEOPLE_COMMAND_CENTER_SOURCE_FAILED", { source, error });
    return {
      source,
      status: "error",
      data: fallback,
      error: error?.message || "Source unavailable",
    };
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(
      url.searchParams.get("organizationId") ||
        url.searchParams.get("organization_id"),
    );
    const entityId = clean(
      url.searchParams.get("entityId") || url.searchParams.get("entity_id"),
    );
    const periodId = clean(
      url.searchParams.get("periodId") || url.searchParams.get("period_id"),
    );

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 },
      );
    }

    const context = await resolveBusinessContext({
      organizationId: access.organizationId,
      entityId: entityId || null,
      periodId: periodId || null,
      request,
      access,
    });

    if (!context.success) {
      return NextResponse.json(
        { success: false, error: context.error },
        { status: context.status || 400 },
      );
    }

    const resolvedEntityId = context.entityId || null;
    if (!resolvedEntityId) {
      return NextResponse.json({
        success: true,
        ready: false,
        context: {
          organization_id: context.organizationId,
          entity_id: null,
          period_id: context.periodId || null,
          currency: context.currency || null,
        },
        metrics: {},
        queue: [],
        flow: [],
        payroll: null,
        sources: {},
      });
    }

    const timeContext = await resolveOrganizationTimeContext({
      organizationId: context.organizationId,
      entityId: resolvedEntityId,
    });
    const now = new Date();
    const today = localDateString(now, timeContext.timezone);
    const nowParts = partsInTimezone(now, timeContext.timezone);
    const nowMinutes = nowParts.hour * 60 + nowParts.minute;
    const payrollMonth =
      clean(context.period?.start_date).slice(0, 7) || today.slice(0, 7);

    const cohortSource = await safe(
      "employee_employment_assignments",
      () =>
        loadEmploymentCohort({
          organizationId: context.organizationId,
          entityId: resolvedEntityId,
          startDate: today,
          endDate: today,
        }),
      {
        assignments: [],
        staff: [],
        staffIds: [],
        fullPeriodStaffIds: [],
        partialPeriodStaffIds: [],
        assignmentByStaff: new Map(),
      },
    );

    const cohort = cohortSource.data;
    const staff = Array.isArray(cohort.staff) ? cohort.staff : [];
    const staffIds = Array.isArray(cohort.staffIds) ? cohort.staffIds : [];
    const staffById = new Map(staff.map((member) => [member.id, member]));

    const [
      schedulesSource,
      attendanceSource,
      timeOffSource,
      swapsSource,
      compensationSource,
      payrollRecordsSource,
      payrollReadinessSource,
    ] = await Promise.all([
      safe("staff_schedules", async () => {
        const { data, error } = await supabaseAdmin
          .from("staff_schedules")
          .select("id,staff_id,staff_name,role,department,shift_date,start_time,end_time,shift_type,section,status,party_id,entity_id")
          .eq("organization_id", context.organizationId)
          .eq("entity_id", resolvedEntityId)
          .eq("shift_date", today)
          .order("start_time", { ascending: true })
          .limit(1000);
        if (error) throw error;
        return data || [];
      }, []),
      safe("staff_attendance", async () => {
        const { data, error } = await supabaseAdmin
          .from("staff_attendance")
          .select("id,staff_id,staff_name,shift_date,scheduled_start,actual_start,scheduled_end,actual_end,late_minutes,attendance_status,approved_at,notes,schedule_id,shift_id,clock_in_location_verified,entity_id")
          .eq("organization_id", context.organizationId)
          .eq("entity_id", resolvedEntityId)
          .eq("shift_date", today)
          .order("scheduled_start", { ascending: true })
          .limit(1000);
        if (error) throw error;
        return data || [];
      }, []),
      safe("staff_time_off_requests", async () => {
        const { data, error } = await supabaseAdmin
          .from("staff_time_off_requests")
          .select("id,staff_id,party_id,leave_type,attendance_classification,start_date,end_date,reason,status,requested_at,reviewed_at,entity_id")
          .eq("organization_id", context.organizationId)
          .eq("entity_id", resolvedEntityId)
          .order("requested_at", { ascending: false })
          .limit(1000);
        if (error) throw error;
        return data || [];
      }, []),
      safe("staff_shift_swap_requests", async () => {
        const { data, error } = await supabaseAdmin
          .from("staff_shift_swap_requests")
          .select("id,schedule_id,requester_staff_id,target_staff_id,shift_date,start_time,end_time,reason,status,requested_at,target_responded_at,reviewed_at,entity_id")
          .eq("organization_id", context.organizationId)
          .eq("entity_id", resolvedEntityId)
          .order("requested_at", { ascending: false })
          .limit(1000);
        if (error) throw error;
        return data || [];
      }, []),
      safe("employee_compensation_profiles", async () => {
        const { data, error } = await supabaseAdmin
          .from("employee_compensation_profiles")
          .select("id,staff_account_id,party_id,effective_from,effective_to,salary_type,payroll_frequency,currency,monthly_salary,hourly_rate,bank_name,bank_account,entity_id")
          .eq("organization_id", context.organizationId)
          .eq("entity_id", resolvedEntityId)
          .lte("effective_from", today)
          .or(`effective_to.is.null,effective_to.gte.${today}`)
          .order("effective_from", { ascending: false })
          .limit(5000);
        if (error) throw error;
        return data || [];
      }, []),
      safe("payroll_records", async () => {
        const { data, error } = await supabaseAdmin
          .from("payroll_records")
          .select("id,staff_id,staff_name,role,payroll_month,status,payout_status,review_required,review_status,review_reason,variance_hours,employee_dispute,dispute_resolved,payroll_certified,accounting_period_closed,entity_id")
          .eq("organization_id", context.organizationId)
          .eq("entity_id", resolvedEntityId)
          .eq("payroll_month", payrollMonth)
          .order("created_at", { ascending: false })
          .limit(5000);
        if (error) throw error;
        return data || [];
      }, []),
      safe("payroll_readiness", async () => {
        return buildPayrollReadiness({
          organizationId: context.organizationId,
          entityId: resolvedEntityId,
          payrollMonth,
        });
      }, null),
    ]);

    const schedules = (schedulesSource.data || []).filter((row) => {
      const status = normalized(row.status);
      return !status || OPEN_SCHEDULE_STATUSES.has(status);
    });
    const attendance = attendanceSource.data || [];
    const timeOff = timeOffSource.data || [];
    const swaps = swapsSource.data || [];
    const compensation = (compensationSource.data || []).filter((row) =>
      effectiveOn(row, today),
    );
    const payrollRecords = payrollRecordsSource.data || [];
    const readiness = payrollReadinessSource.data || null;

    const attendanceByScheduleId = new Map(
      attendance
        .filter((row) => row.schedule_id)
        .map((row) => [row.schedule_id, row]),
    );
    const attendanceByStaffId = new Map(
      attendance
        .filter((row) => row.staff_id)
        .map((row) => [row.staff_id, row]),
    );

    const approvedLeaveToday = timeOff.filter(
      (row) => normalized(row.status) === "approved" && overlaps(row, today),
    );
    const pendingTimeOff = timeOff.filter((row) => normalized(row.status) === "pending");
    const pendingSwaps = swaps.filter((row) =>
      ["pending_target", "pending_manager"].includes(normalized(row.status)),
    );
    const unassignedSchedules = schedules.filter((row) => !row.staff_id);
    const clockedIn = attendance.filter(
      (row) => row.actual_start && !row.actual_end && normalized(row.attendance_status) !== "absent",
    );
    const attendanceExceptions = attendance.filter(
      (row) =>
        numeric(row.late_minutes) > 0 ||
        ATTENDANCE_EXCEPTION_STATUSES.has(normalized(row.attendance_status)),
    );
    const missingClockIns = schedules.filter((schedule) => {
      if (!schedule.staff_id) return false;
      const startMinutes = minutesFromTime(schedule.start_time);
      if (startMinutes === null || startMinutes > nowMinutes) return false;
      const evidence =
        attendanceByScheduleId.get(schedule.id) ||
        attendanceByStaffId.get(schedule.staff_id);
      return !evidence?.actual_start && normalized(evidence?.attendance_status) !== "absent";
    });

    const compensationByStaff = latestByStaff(compensation);
    const compensationMissing = staff.filter(
      (member) => !compensationByStaff.has(member.id),
    );
    const compensationAmountMissing = staff.filter((member) => {
      const profile = compensationByStaff.get(member.id);
      if (!profile) return false;
      return numeric(profile.monthly_salary) <= 0 && numeric(profile.hourly_rate) <= 0;
    });

    const payrollReviewRequired = payrollRecords.filter(
      (row) =>
        row.review_required === true &&
        !["approved", "complete", "completed", "resolved"].includes(
          normalized(row.review_status),
        ),
    );
    const payrollDisputes = payrollRecords.filter(
      (row) => clean(row.employee_dispute) && row.dispute_resolved !== true,
    );
    const payrollPaymentPending = payrollRecords.filter(
      (row) => !["paid", "settled", "complete", "completed"].includes(normalized(row.payout_status)),
    );

    const readinessBlockers = Array.isArray(readiness?.blockers) ? readiness.blockers : [];
    const readinessWarnings = Array.isArray(readiness?.warnings) ? readiness.warnings : [];
    const periodState = readinessBlockers.filter((issue) =>
      PAYROLL_PERIOD_STATE_CODES.has(clean(issue?.code).toUpperCase()),
    );
    const actionableReadinessBlockers = readinessBlockers.filter(
      (issue) => !PAYROLL_PERIOD_STATE_CODES.has(clean(issue?.code).toUpperCase()),
    );

    const queue = [];

    missingClockIns.slice(0, 8).forEach((schedule) => {
      const member = staffById.get(schedule.staff_id);
      queue.push({
        id: `missing-clock:${schedule.id}`,
        kind: "attendance",
        priority: "attention",
        title: `${member?.name || schedule.staff_name || "Employee"} has no clock-in evidence`,
        detail: `${schedule.start_time || "Scheduled"}${schedule.department ? ` · ${schedule.department}` : ""}`,
        status: "Check attendance",
        href: peopleHref("attendance"),
      });
    });

    attendanceExceptions.slice(0, 8).forEach((row) => {
      queue.push({
        id: `attendance:${row.id}`,
        kind: "attendance",
        priority: "attention",
        title: `${row.staff_name || staffById.get(row.staff_id)?.name || "Employee"} attendance exception`,
        detail: numeric(row.late_minutes) > 0
          ? `${numeric(row.late_minutes)} minutes late`
          : titleCase(row.attendance_status || "Attendance review"),
        status: row.attendance_status || "Review",
        href: peopleHref("attendance"),
      });
    });

    unassignedSchedules.slice(0, 6).forEach((row) => {
      queue.push({
        id: `unassigned:${row.id}`,
        kind: "schedule",
        priority: "attention",
        title: "Unassigned shift",
        detail: [row.start_time && row.end_time ? `${row.start_time}–${row.end_time}` : null, row.department, row.section]
          .filter(Boolean)
          .join(" · "),
        status: "Staffing gap",
        href: peopleHref("scheduling"),
      });
    });

    pendingTimeOff.slice(0, 6).forEach((row) => {
      const member = staffById.get(row.staff_id);
      queue.push({
        id: `time-off:${row.id}`,
        kind: "time_off",
        priority: "review",
        title: `${member?.name || "Employee"} requested time off`,
        detail: `${titleCase(row.leave_type || "Leave")} · ${row.start_date}–${row.end_date}`,
        status: "Manager review",
        href: peopleHref("requests"),
      });
    });

    pendingSwaps.slice(0, 6).forEach((row) => {
      const requester = staffById.get(row.requester_staff_id);
      const target = staffById.get(row.target_staff_id);
      queue.push({
        id: `swap:${row.id}`,
        kind: "shift_swap",
        priority: normalized(row.status) === "pending_manager" ? "attention" : "review",
        title: `${requester?.name || "Employee"} shift swap`,
        detail: [
          row.shift_date,
          target?.name ? `with ${target.name}` : null,
          normalized(row.status) === "pending_manager" ? "Manager decision required" : "Waiting for colleague",
        ]
          .filter(Boolean)
          .join(" · "),
        status: row.status || "Pending",
        href: peopleHref("requests"),
      });
    });

    payrollReviewRequired.slice(0, 6).forEach((row) => {
      queue.push({
        id: `payroll-review:${row.id}`,
        kind: "payroll",
        priority: "attention",
        title: `${row.staff_name || staffById.get(row.staff_id)?.name || "Employee"} payroll review`,
        detail: row.review_reason || `${numeric(row.variance_hours)} hour variance`,
        status: row.review_status || "Review required",
        href: peopleHref("payroll/governance"),
      });
    });

    payrollDisputes.slice(0, 4).forEach((row) => {
      queue.push({
        id: `payroll-dispute:${row.id}`,
        kind: "payroll",
        priority: "attention",
        title: `${row.staff_name || staffById.get(row.staff_id)?.name || "Employee"} payroll dispute`,
        detail: clean(row.employee_dispute),
        status: "Resolve dispute",
        href: peopleHref("payroll/governance"),
      });
    });

    compensationMissing.slice(0, 5).forEach((member) => {
      queue.push({
        id: `compensation:${member.id}`,
        kind: "compensation",
        priority: "attention",
        title: `${member.name || member.email || "Employee"} needs compensation setup`,
        detail: [member.position, member.department].filter(Boolean).join(" · ") || "Effective compensation profile missing",
        status: "Payroll blocker",
        href: peopleHref("compensation"),
      });
    });

    actionableReadinessBlockers.slice(0, 5).forEach((issue, index) => {
      queue.push({
        id: `readiness:${clean(issue?.code) || index}`,
        kind: "payroll_readiness",
        priority: "attention",
        title: titleCase(issue?.code || "Payroll readiness blocker"),
        detail: clean(issue?.message) || "Payroll input requires attention",
        status: "Resolve before payroll",
        href: peopleHref("payroll"),
      });
    });

    const sources = Object.fromEntries(
      [
        cohortSource,
        schedulesSource,
        attendanceSource,
        timeOffSource,
        swapsSource,
        compensationSource,
        payrollRecordsSource,
        payrollReadinessSource,
      ].map((source) => [source.source, { status: source.status, error: source.error }]),
    );

    const attendanceIssueIds = new Set([
      ...attendanceExceptions.map((row) => row.id),
      ...missingClockIns.map((row) => `schedule:${row.id}`),
    ]);

    return NextResponse.json({
      success: true,
      ready: true,
      context: {
        organization_id: context.organizationId,
        entity_id: resolvedEntityId,
        period_id: context.periodId || null,
        payroll_month: payrollMonth,
        business_date: today,
        timezone: timeContext.timezone,
        currency: context.currency || timeContext.currency || null,
      },
      metrics: {
        people: {
          active: staff.length,
          compensation_missing: compensationMissing.length + compensationAmountMissing.length,
          source_status:
            cohortSource.status === "error" || compensationSource.status === "error"
              ? "error"
              : "connected",
        },
        today: {
          scheduled: schedules.filter((row) => Boolean(row.staff_id)).length,
          on_duty: clockedIn.length,
          on_leave: approvedLeaveToday.length,
          unassigned_shifts: unassignedSchedules.length,
          attendance_exceptions: attendanceIssueIds.size,
          source_status:
            schedulesSource.status === "error" || attendanceSource.status === "error"
              ? "error"
              : "connected",
        },
        requests: {
          time_off: pendingTimeOff.length,
          shift_swaps: pendingSwaps.length,
          total: pendingTimeOff.length + pendingSwaps.length,
          source_status:
            timeOffSource.status === "error" || swapsSource.status === "error"
              ? "error"
              : "connected",
        },
        payroll: {
          review_required: payrollReviewRequired.length,
          disputes: payrollDisputes.length,
          payment_pending: payrollPaymentPending.length,
          actionable_blockers: actionableReadinessBlockers.length,
          warnings: readinessWarnings.length,
          source_status:
            payrollRecordsSource.status === "error" || payrollReadinessSource.status === "error"
              ? "error"
              : "connected",
        },
      },
      payroll: {
        month: payrollMonth,
        can_generate: Boolean(readiness?.canGenerate),
        can_complete_lifecycle: Boolean(readiness?.canCompleteLifecycle),
        period_open: periodState.length > 0,
        blocker_count: actionableReadinessBlockers.length,
        warning_count: readinessWarnings.length,
        blockers: actionableReadinessBlockers.slice(0, 8),
        warnings: readinessWarnings.slice(0, 8),
        summary: readiness?.summary || {},
      },
      flow: [
        {
          id: "schedule",
          label: "Plan schedule",
          count: unassignedSchedules.length,
          detail: `${schedules.length} shifts today · ${unassignedSchedules.length} unassigned`,
          href: peopleHref("scheduling"),
        },
        {
          id: "attendance",
          label: "Attend",
          count: attendanceIssueIds.size,
          detail: `${clockedIn.length} on duty · ${attendanceIssueIds.size} exceptions`,
          href: peopleHref("attendance"),
        },
        {
          id: "requests",
          label: "Approve requests",
          count: pendingTimeOff.length + pendingSwaps.length,
          detail: `${pendingTimeOff.length} time off · ${pendingSwaps.length} swaps`,
          href: peopleHref("requests"),
        },
        {
          id: "payroll",
          label: "Prepare payroll",
          count: actionableReadinessBlockers.length + payrollReviewRequired.length,
          detail: periodState.length
            ? `${payrollMonth} is still open · ${actionableReadinessBlockers.length} other blockers`
            : `${actionableReadinessBlockers.length} blockers · ${readinessWarnings.length} warnings`,
          href: peopleHref("payroll"),
        },
        {
          id: "pay",
          label: "Pay & close",
          count: payrollPaymentPending.length + payrollDisputes.length,
          detail: `${payrollPaymentPending.length} payment pending · ${payrollDisputes.length} disputes`,
          href: peopleHref("payroll/payments"),
        },
        {
          id: "records",
          label: "Employee records",
          count: staff.length,
          detail: `${compensationMissing.length + compensationAmountMissing.length} compensation setup gaps`,
          href: peopleHref("directory"),
        },
      ],
      queue: queue.slice(0, 20),
      sources,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("PEOPLE_COMMAND_CENTER_FAILED", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load People command center",
      },
      { status: 500 },
    );
  }
}
