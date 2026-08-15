export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  approvePayrollRecord,
  rejectPayrollRecord,
  lockPayrollRecord,
  resolvePayrollDispute,
  recalculatePayrollRecord,
  reviewAttendancePenalty,
  finalizePayrollRecord,
  closePayrollAccountingPeriod,
  certifyPayrollRecord,
  archivePayrollRecord,
  loadPayrollAttendanceReconciliation,
  isPayrollAttendanceSnapshotStale,
} from "@/lib/people/payroll";

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

function normalizeCurrency(value) {
  const currency = String(value || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
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

        return [key, reconciliation];
      } catch (error) {
        console.error("PAYROLL_ATTENDANCE_READINESS_ERROR", {
          organizationId,
          staffId: target.staffId,
          payrollMonth: target.payrollMonth,
          error,
        });

        return [key, { error: error?.message || "Unable to verify attendance readiness" }];
      }
    })
  );

  const readinessByKey = new Map(readinessEntries);

  return records.map((record) => {
    if (!needsLiveAttendanceReadiness(record)) return record;

    const key = `${record.staff_id}:${record.payroll_month}`;
    const reconciliation = readinessByKey.get(key) || null;

    if (!reconciliation || reconciliation.error) {
      return {
        ...record,
        attendance_reconciliation: {
          available: false,
          unresolvedSchedules: null,
          unresolvedScheduleIds: [],
          recalculationRequired: false,
          error: reconciliation?.error || "Unable to verify attendance readiness",
        },
      };
    }

    const expectedApprovedHours = Number(
      (Number(record.worked_hours || 0) + Number(reconciliation.creditedHours || 0)).toFixed(2)
    );
    const reconciledValuesChanged =
      Number(record.missed_shifts || 0) !== Number(reconciliation.missedShifts || 0) ||
      Math.abs(Number(record.approved_hours || 0) - expectedApprovedHours) > 0.01;
    const snapshotStale = isPayrollAttendanceSnapshotStale({
      reconciliation,
      calculatedAt: record.created_at,
    });

    return {
      ...record,
      attendance_reconciliation: {
        available: true,
        unresolvedSchedules: reconciliation.unresolvedSchedules,
        unresolvedScheduleIds: reconciliation.unresolvedScheduleIds,
        missedShifts: reconciliation.missedShifts,
        creditedHours: reconciliation.creditedHours,
        creditedSchedules: reconciliation.creditedSchedules,
        classificationCounts: reconciliation.classificationCounts,
        latestPayrollInputAt: reconciliation.latestPayrollInputAt,
        recalculationRequired:
          reconciliation.unresolvedSchedules === 0 &&
          (snapshotStale || reconciledValuesChanged),
      },
    };
  });
}

async function attachLegalEntityCurrency({ organizationId, payroll }) {
  const records = Array.isArray(payroll) ? payroll : [];
  const entityIds = [...new Set(records.map((record) => record.entity_id).filter(Boolean))];

  if (!entityIds.length) return records;

  const { data, error } = await supabaseAdmin
    .from("legal_entities")
    .select("id,legal_name,display_name,currency")
    .eq("organization_id", organizationId)
    .in("id", entityIds);

  if (error) throw error;

  const entityById = new Map((data || []).map((entity) => [entity.id, entity]));

  return records.map((record) => {
    const entity = entityById.get(record.entity_id) || null;
    const currency = normalizeCurrency(entity?.currency);

    return {
      ...record,
      currency_code: currency,
      legal_entity: entity
        ? {
            id: entity.id,
            name: entity.display_name || entity.legal_name || entity.id,
            currency,
          }
        : null,
    };
  });
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

    const payrollWithAttendance = await attachLiveAttendanceReadiness({
      organizationId: context.organizationId,
      payroll: data || [],
    });
    const payroll = await attachLegalEntityCurrency({
      organizationId: context.organizationId,
      payroll: payrollWithAttendance,
    });

    const currencies = [...new Set(payroll.map((record) => record.currency_code).filter(Boolean))];

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      role: context.role,
      currency: currencies.length === 1 ? currencies[0] : "",
      currencies,
      mixedCurrencies: currencies.length > 1,
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
        latestPayrollInputAt: error?.latestPayrollInputAt || null,
      },
      { status: Number(error?.status) || 400 }
    );
  }
}
