export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import loadOperationalSettings from "@/lib/settings/loadOperationalSettings";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { approvePayrollRecord } from "@/lib/payroll/consolidation/approvePayrollRecord";
import rejectPayrollRecord from "@/lib/payroll/consolidation/rejectPayrollRecord";
import lockPayrollRecord from "@/lib/payroll/consolidation/lockPayrollRecord";
import resolvePayrollDispute from "@/lib/payroll/consolidation/resolvePayrollDispute";
import { recalculatePayrollRecord } from "@/lib/payroll/consolidation/recalculatePayrollRecord";
import reviewAttendancePenalty from "@/lib/payroll/consolidation/reviewAttendancePenalty";
import finalizePayrollRecord from "@/lib/payroll/consolidation/finalizePayrollRecord";
import closePayrollAccountingPeriod from "@/lib/payroll/consolidation/closePayrollAccountingPeriod";
import certifyPayrollRecord from "@/lib/payroll/consolidation/certifyPayrollRecord";
import archivePayrollRecord from "@/lib/payroll/consolidation/archivePayrollRecord";
import loadPayrollAttendanceReconciliation from "@/lib/payroll/consolidation/loadPayrollAttendanceReconciliation";

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

const FINALIZE_ROLES = new Set([
  "OWNER",
  "ACCOUNTING_ADMIN",
  "PAYROLL_ADMIN",
]);

const TERMINAL_ROLES = new Set([
  "OWNER",
  "ACCOUNTING_ADMIN",
]);

const LIVE_ATTENDANCE_REVIEW_STATUSES = new Set([
  "GENERATED",
  "RECALCULATED",
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

function needsLiveAttendanceReadiness(record) {
  return Boolean(
    record?.review_required === true &&
      record?.review_status === "PENDING" &&
      LIVE_ATTENDANCE_REVIEW_STATUSES.has(String(record?.status || "").toUpperCase()) &&
      record?.staff_id &&
      record?.payroll_month
  );
}

async function attachLiveAttendanceReadiness({ organizationId, payroll }) {
  const records = Array.isArray(payroll) ? payroll : [];
  const candidates = records.filter(needsLiveAttendanceReadiness);

  if (!candidates.length) return records;

  const uniqueKeys = new Map();
  for (const record of candidates) {
    const key = `${record.staff_id}:${record.payroll_month}`;
    if (!uniqueKeys.has(key)) {
      uniqueKeys.set(key, {
        staffId: record.staff_id,
        payrollMonth: record.payroll_month,
      });
    }
  }

  const readinessEntries = await Promise.all(
    [...uniqueKeys.entries()].map(async ([key, target]) => {
      try {
        const reconciliation = await loadPayrollAttendanceReconciliation({
          organizationId,
          staffId: target.staffId,
          payrollMonth: target.payrollMonth,
        });

        return [
          key,
          {
            available: true,
            unresolvedSchedules: reconciliation.unresolvedSchedules,
            unresolvedScheduleIds: reconciliation.unresolvedScheduleIds,
            missedShifts: reconciliation.missedShifts,
            creditedHours: reconciliation.creditedHours,
            creditedSchedules: reconciliation.creditedSchedules,
            classificationCounts: reconciliation.classificationCounts,
          },
        ];
      } catch (error) {
        console.error("PAYROLL_ATTENDANCE_READINESS_ERROR", {
          organizationId,
          staffId: target.staffId,
          payrollMonth: target.payrollMonth,
          error,
        });

        return [
          key,
          {
            available: false,
            unresolvedSchedules: null,
            unresolvedScheduleIds: [],
            error: error?.message || "Unable to verify attendance readiness",
          },
        ];
      }
    })
  );

  const readinessByKey = new Map(readinessEntries);

  return records.map((record) => {
    if (!needsLiveAttendanceReadiness(record)) return record;

    const key = `${record.staff_id}:${record.payroll_month}`;
    return {
      ...record,
      attendance_reconciliation: readinessByKey.get(key) || null,
    };
  });
}

export async function GET(request) {
  try {
    const context = await governanceContext(request);
    if (context.response) return context.response;

    const [payrollResult, payrollSettings] = await Promise.all([
      supabaseAdmin
        .from("payroll_records")
        .select("*")
        .eq("organization_id", context.organizationId)
        .order("payroll_month", { ascending: false })
        .order("created_at", { ascending: false }),
      loadOperationalSettings({
        organizationId: context.organizationId,
        domain: "PAYROLL",
      }),
    ]);

    if (payrollResult.error) throw payrollResult.error;

    const payroll = await attachLiveAttendanceReadiness({
      organizationId: context.organizationId,
      payroll: payrollResult.data || [],
    });

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      role: context.role,
      currency: String(payrollSettings?.currency || "").trim().toUpperCase(),
      capabilities: {
        canReview: true,
        canResolveDispute: true,
        canRecalculate: true,
        canLock: LOCK_ROLES.has(context.role),
        canFinalize: FINALIZE_ROLES.has(context.role),
        canAccountingClose: TERMINAL_ROLES.has(context.role),
        canCertify: TERMINAL_ROLES.has(context.role),
        canArchive: TERMINAL_ROLES.has(context.role),
      },
      payroll,
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
    } else if (action === "REVIEW_ATTENDANCE_PENALTY") {
      result = await reviewAttendancePenalty({
        payrollRecordId,
        organizationId: context.organizationId,
        reviewedBy: context.staff.id,
        actorName,
        role: context.role,
        decision: body?.decision,
        adjustedAmount: body?.adjustedAmount,
        notes: body?.notes,
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
    } else if (action === "RECALCULATE") {
      result = await recalculatePayrollRecord({
        payrollRecordId,
        organizationId: context.organizationId,
        recalculatedBy: context.staff.id,
        actorName,
        role: context.role,
      });
    } else if (action === "RESOLVE_DISPUTE") {
      result = await resolvePayrollDispute({
        payrollRecordId,
        organizationId: context.organizationId,
        resolvedBy: actorName,
        resolutionNotes: body?.resolutionNotes,
        role: context.role,
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
    } else if (action === "FINALIZE") {
      if (!FINALIZE_ROLES.has(context.role)) {
        return NextResponse.json(
          { success: false, error: "Payroll finalization permission required" },
          { status: 403 }
        );
      }

      result = await finalizePayrollRecord({
        payrollRecordId,
        organizationId: context.organizationId,
        finalizedBy: actorName,
        role: context.role,
      });
    } else if (action === "ACCOUNTING_CLOSE") {
      if (!TERMINAL_ROLES.has(context.role)) {
        return NextResponse.json(
          { success: false, error: "Payroll accounting close permission required" },
          { status: 403 }
        );
      }

      result = await closePayrollAccountingPeriod({
        payrollRecordId,
        organizationId: context.organizationId,
        closedBy: actorName,
        role: context.role,
      });
    } else if (action === "CERTIFY") {
      if (!TERMINAL_ROLES.has(context.role)) {
        return NextResponse.json(
          { success: false, error: "Payroll certification permission required" },
          { status: 403 }
        );
      }

      result = await certifyPayrollRecord({
        payrollRecordId,
        organizationId: context.organizationId,
        certifiedBy: actorName,
        role: context.role,
      });
    } else if (action === "ARCHIVE") {
      if (!TERMINAL_ROLES.has(context.role)) {
        return NextResponse.json(
          { success: false, error: "Payroll archive permission required" },
          { status: 403 }
        );
      }

      result = await archivePayrollRecord({
        payrollRecordId,
        organizationId: context.organizationId,
        archivedBy: actorName,
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
      {
        success: false,
        error: error?.message || "Unable to execute payroll action",
        code: error?.code || null,
        unresolvedScheduleIds: Array.isArray(error?.unresolvedScheduleIds)
          ? error.unresolvedScheduleIds
          : [],
      },
      { status: Number(error?.status) || 400 }
    );
  }
}
