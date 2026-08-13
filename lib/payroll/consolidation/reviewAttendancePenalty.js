import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import createPayrollAuditLog from "@/lib/payroll/audit/createPayrollAuditLog";
import { PAYROLL_STATUS } from "@/lib/payroll/consolidation/payrollStatusMachine";
import isPayrollImmutable from "@/lib/payroll/consolidation/isPayrollImmutable";
import loadPayrollAttendanceReconciliation, {
  isPayrollAttendanceSnapshotStale,
} from "@/lib/payroll/consolidation/loadPayrollAttendanceReconciliation";

const ALLOWED_ROLES = new Set([
  "OWNER",
  "SUPER_ADMIN",
  "MANAGER",
  "HR_ADMIN",
  "PAYROLL_ADMIN",
  "ACCOUNTING_ADMIN",
]);

const REVIEWABLE_STATUSES = new Set([
  PAYROLL_STATUS.GENERATED,
  PAYROLL_STATUS.RECALCULATED,
]);

function money(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Attendance penalty amount must be a non-negative number");
  }
  return Number(amount.toFixed(2));
}

function hours(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : 0;
}

function throwRecalculationRequired(attendanceReconciliation) {
  const error = new Error(
    "Attendance evidence changed after this payroll record was generated. Recalculate payroll before completing manager review."
  );
  error.status = 409;
  error.code = "PAYROLL_ATTENDANCE_RECALCULATION_REQUIRED";
  error.latestPayrollInputAt = attendanceReconciliation.latestPayrollInputAt || null;
  throw error;
}

export default async function reviewAttendancePenalty({
  payrollRecordId,
  organizationId,
  reviewedBy,
  actorName = "MANAGER",
  role = "MANAGER",
  decision,
  adjustedAmount = null,
  notes = "",
}) {
  const normalizedRole = String(role || "").trim().toUpperCase();
  const normalizedDecision = String(decision || "").trim().toUpperCase();
  const cleanNotes = String(notes || "").trim();

  if (!ALLOWED_ROLES.has(normalizedRole)) {
    throw new Error("Unauthorized payroll manager review");
  }
  if (!payrollRecordId) throw new Error("payrollRecordId required");
  if (!organizationId) throw new Error("organizationId required");
  if (!reviewedBy) throw new Error("reviewedBy required");
  if (!["APPROVE", "WAIVE", "ADJUST"].includes(normalizedDecision)) {
    throw new Error("Manager review decision must be APPROVE, WAIVE, or ADJUST");
  }
  if (["WAIVE", "ADJUST"].includes(normalizedDecision) && !cleanNotes) {
    throw new Error("Manager notes are required when changing the proposed deduction");
  }

  const { data: record, error: recordError } = await supabaseAdmin
    .from("payroll_records")
    .select("*")
    .eq("id", payrollRecordId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (recordError) throw recordError;
  if (!record) throw new Error("Payroll record not found");
  if (isPayrollImmutable(record.status)) {
    throw new Error("Archived payroll is immutable");
  }
  if (!REVIEWABLE_STATUSES.has(record.status)) {
    throw new Error("Payroll review can only be completed before payroll approval");
  }
  if (record.review_required !== true || record.review_status !== "PENDING") {
    throw new Error("Payroll record does not have a pending manager review");
  }

  const attendanceReconciliation = await loadPayrollAttendanceReconciliation({
    organizationId,
    staffId: record.staff_id,
    payrollMonth: record.payroll_month,
  });

  if (attendanceReconciliation.unresolvedSchedules > 0) {
    const error = new Error(
      `${attendanceReconciliation.unresolvedSchedules} expired published schedule${attendanceReconciliation.unresolvedSchedules === 1 ? " still requires" : "s still require"} Attendance classification before Payroll review can be completed`
    );
    error.status = 409;
    error.code = "PAYROLL_ATTENDANCE_CLASSIFICATION_REQUIRED";
    error.unresolvedScheduleIds = attendanceReconciliation.unresolvedScheduleIds;
    throw error;
  }

  if (
    isPayrollAttendanceSnapshotStale({
      reconciliation: attendanceReconciliation,
      calculatedAt: record.created_at,
    })
  ) {
    throwRecalculationRequired(attendanceReconciliation);
  }

  const expectedApprovedHours = hours(
    hours(record.worked_hours) + attendanceReconciliation.creditedHours
  );
  const storedAttendanceChanged =
    Number(record.missed_shifts || 0) !== attendanceReconciliation.missedShifts ||
    Math.abs(hours(record.approved_hours) - expectedApprovedHours) > 0.01;

  if (storedAttendanceChanged) {
    throwRecalculationRequired(attendanceReconciliation);
  }

  const currentAttendancePenalty = money(record.attendance_penalty);
  let approvedAttendancePenalty = currentAttendancePenalty;
  let reviewStatus = "APPROVED";

  if (normalizedDecision === "WAIVE") {
    approvedAttendancePenalty = 0;
    reviewStatus = "WAIVED";
  } else if (normalizedDecision === "ADJUST") {
    approvedAttendancePenalty = money(adjustedAmount);
    reviewStatus = "ADJUSTED";
  }

  const currentTotalDeductions = money(record.deductions);
  const revisedTotalDeductions = money(
    Math.max(
      0,
      currentTotalDeductions - currentAttendancePenalty + approvedAttendancePenalty
    )
  );
  const grossSalary = money(record.gross_salary);
  const revisedSalary = Number((grossSalary - revisedTotalDeductions).toFixed(2));
  const reviewedAt = new Date().toISOString();
  const penaltyReview = currentAttendancePenalty > 0 || approvedAttendancePenalty > 0;
  const reviewReason = [
    record.review_reason,
    penaltyReview
      ? `Attendance deduction ${reviewStatus.toLowerCase()}: ${approvedAttendancePenalty.toFixed(2)}`
      : `Payroll manager review ${reviewStatus.toLowerCase()}`,
    cleanNotes || null,
  ]
    .filter(Boolean)
    .join(" · ");

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("payroll_records")
    .update({
      attendance_penalty: approvedAttendancePenalty,
      deductions: revisedTotalDeductions,
      final_salary: revisedSalary,
      adjusted_salary: revisedSalary,
      review_status: reviewStatus,
      review_reason: reviewReason,
      reviewed_by: reviewedBy,
      reviewed_at: reviewedAt,
      employee_acknowledged: false,
      employee_acknowledged_at: null,
    })
    .eq("id", payrollRecordId)
    .eq("organization_id", organizationId)
    .in("status", [PAYROLL_STATUS.GENERATED, PAYROLL_STATUS.RECALCULATED])
    .select("*")
    .single();

  if (updateError) throw updateError;

  await createPayrollAuditLog({
    organizationId,
    payrollPeriod: record.payroll_month,
    action: penaltyReview
      ? `ATTENDANCE_PENALTY_${reviewStatus}`
      : `PAYROLL_MANAGER_REVIEW_${reviewStatus}`,
    performedBy: actorName,
    targetStaffId: record.staff_id,
    targetPartyId: record.party_id || null,
    notes: penaltyReview
      ? `${currentAttendancePenalty.toFixed(2)} -> ${approvedAttendancePenalty.toFixed(2)}${cleanNotes ? ` · ${cleanNotes}` : ""}`
      : cleanNotes || "Manager accepted payroll review evidence",
  });

  return {
    success: true,
    record: updated,
    previousAttendancePenalty: currentAttendancePenalty,
    attendancePenalty: approvedAttendancePenalty,
    reviewStatus,
    attendanceReconciliation,
  };
}
