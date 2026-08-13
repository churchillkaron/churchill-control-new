import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import createPayrollAuditLog from "@/lib/payroll/audit/createPayrollAuditLog";
import generateMonthlyPayroll from "@/lib/payroll/consolidation/generateMonthlyPayroll";
import { PAYROLL_STATUS } from "@/lib/payroll/consolidation/payrollStatusMachine";
import loadPayrollAttendanceReconciliation, {
  isPayrollAttendanceSnapshotStale,
} from "@/lib/payroll/consolidation/loadPayrollAttendanceReconciliation";

const ALLOWED_ROLES = new Set([
  "OWNER",
  "SUPER_ADMIN",
  "MANAGER",
  "ACCOUNTING",
  "ACCOUNTING_ADMIN",
  "PAYROLL_ADMIN",
]);

const RECALCULATABLE_PRE_APPROVAL_STATUSES = new Set([
  PAYROLL_STATUS.GENERATED,
  PAYROLL_STATUS.RECALCULATED,
  PAYROLL_STATUS.REJECTED,
]);

function throwClassificationRequired(reconciliation) {
  const error = new Error(
    `${reconciliation.unresolvedSchedules} expired published schedule${reconciliation.unresolvedSchedules === 1 ? " still requires" : "s still require"} Attendance classification before Payroll can be recalculated`
  );
  error.status = 409;
  error.code = "PAYROLL_ATTENDANCE_CLASSIFICATION_REQUIRED";
  error.unresolvedScheduleIds = reconciliation.unresolvedScheduleIds;
  throw error;
}

export async function recalculatePayrollRecord({
  payrollRecordId,
  organizationId,
  recalculatedBy,
  actorName = "PAYROLL_ADMIN",
  role = "PAYROLL_ADMIN",
}) {
  if (!ALLOWED_ROLES.has(String(role || "").toUpperCase())) {
    throw new Error("Unauthorized payroll recalculation");
  }

  if (!payrollRecordId) throw new Error("payrollRecordId required");
  if (!organizationId) throw new Error("organizationId required");
  if (!recalculatedBy) throw new Error("recalculatedBy required");

  const { data: record, error: recordError } = await supabaseAdmin
    .from("payroll_records")
    .select("*")
    .eq("id", payrollRecordId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (recordError) throw recordError;
  if (!record) throw new Error("Payroll record not found");

  if (!RECALCULATABLE_PRE_APPROVAL_STATUSES.has(record.status)) {
    throw new Error(
      "Payroll recalculation is only available before payroll approval, lock or payment"
    );
  }

  if (!record.entity_id) {
    throw new Error("Payroll legal entity is required for recalculation");
  }

  if (!record.payroll_month) {
    throw new Error("Payroll month is required for recalculation");
  }

  let recalculationReason = "REJECTED_PAYROLL";

  if ([PAYROLL_STATUS.GENERATED, PAYROLL_STATUS.RECALCULATED].includes(record.status)) {
    const reconciliation = await loadPayrollAttendanceReconciliation({
      organizationId,
      staffId: record.staff_id,
      payrollMonth: record.payroll_month,
    });

    if (reconciliation.unresolvedSchedules > 0) {
      throwClassificationRequired(reconciliation);
    }

    const stale = isPayrollAttendanceSnapshotStale({
      reconciliation,
      calculatedAt: record.created_at,
    });
    const expectedApprovedHours = Number(
      (Number(record.worked_hours || 0) + Number(reconciliation.creditedHours || 0)).toFixed(2)
    );
    const reconciledValuesChanged =
      Number(record.missed_shifts || 0) !== Number(reconciliation.missedShifts || 0) ||
      Math.abs(Number(record.approved_hours || 0) - expectedApprovedHours) > 0.01;

    if (!stale && !reconciledValuesChanged) {
      const error = new Error(
        "Payroll attendance inputs have not changed since this payroll record was generated"
      );
      error.status = 409;
      error.code = "PAYROLL_RECALCULATION_NOT_REQUIRED";
      throw error;
    }

    recalculationReason = "ATTENDANCE_CHANGED";
  }

  const { data: monthRecords, error: monthError } = await supabaseAdmin
    .from("payroll_records")
    .select("id,status,staff_name")
    .eq("organization_id", organizationId)
    .eq("entity_id", record.entity_id)
    .eq("payroll_month", record.payroll_month);

  if (monthError) throw monthError;

  const advancedRecord = (monthRecords || []).find(
    (item) => !RECALCULATABLE_PRE_APPROVAL_STATUSES.has(item.status)
  );

  if (advancedRecord) {
    throw new Error(
      `Payroll month cannot be recalculated after approval, lock or payment: ${advancedRecord.staff_name || "Employee"} is ${advancedRecord.status}`
    );
  }

  const result = await generateMonthlyPayroll({
    organizationId,
    entityId: record.entity_id,
    payrollMonth: record.payroll_month,
    requestedBy: recalculatedBy,
  });

  const { data: recalculatedRecords, error: updateError } = await supabaseAdmin
    .from("payroll_records")
    .update({ status: PAYROLL_STATUS.RECALCULATED })
    .eq("organization_id", organizationId)
    .eq("entity_id", record.entity_id)
    .eq("payroll_month", record.payroll_month)
    .eq("status", PAYROLL_STATUS.GENERATED)
    .select("*");

  if (updateError) throw updateError;

  await createPayrollAuditLog({
    organizationId,
    payrollPeriod: record.payroll_month,
    action: "PAYROLL_RECALCULATED",
    performedBy: actorName,
    targetStaffId: record.staff_id,
    targetPartyId: record.party_id || null,
    notes:
      recalculationReason === "ATTENDANCE_CHANGED"
        ? `Payroll month ${record.payroll_month} recalculated after attendance evidence changed`
        : `Payroll month ${record.payroll_month} recalculated after rejection`,
  });

  return {
    success: true,
    payrollMonth: record.payroll_month,
    entityId: record.entity_id,
    recalculatedCount: recalculatedRecords?.length || 0,
    recalculationReason,
    result,
  };
}
