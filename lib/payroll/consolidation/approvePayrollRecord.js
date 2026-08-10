import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import createPayrollAuditLog from "@/lib/payroll/audit/createPayrollAuditLog";
import {
  PAYROLL_STATUS,
  canTransition,
} from "@/lib/payroll/consolidation/payrollStatusMachine";
import isPayrollImmutable from "@/lib/payroll/consolidation/isPayrollImmutable";

const ALLOWED_ROLES = new Set([
  "OWNER",
  "SUPER_ADMIN",
  "ACCOUNTING",
  "ACCOUNTING_ADMIN",
  "PAYROLL_ADMIN",
  "MANAGER",
]);

const REVIEWABLE_STATUSES = new Set([
  PAYROLL_STATUS.GENERATED,
  PAYROLL_STATUS.RECALCULATED,
]);

export async function approvePayrollRecord({
  payrollRecordId,
  organizationId,
  approvedBy,
  actorName = "MANAGER",
  role = "MANAGER",
}) {
  if (!ALLOWED_ROLES.has(String(role || "").toUpperCase())) {
    throw new Error("Unauthorized payroll approval");
  }

  if (!payrollRecordId) throw new Error("payrollRecordId required");
  if (!organizationId) throw new Error("organizationId required");
  if (!approvedBy) throw new Error("approvedBy required");

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

  if (!canTransition(record.status, PAYROLL_STATUS.APPROVED)) {
    throw new Error(`Invalid payroll transition from ${record.status} to APPROVED`);
  }

  if (!record.entity_id) {
    throw new Error("Payroll legal entity is required for approval");
  }

  if (!record.payroll_month) {
    throw new Error("Payroll month is required for approval");
  }

  const { data: monthRecords, error: monthError } = await supabaseAdmin
    .from("payroll_records")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", record.entity_id)
    .eq("payroll_month", record.payroll_month);

  if (monthError) throw monthError;
  if (!monthRecords?.length) throw new Error("Payroll month not found");

  const rejectedRecord = monthRecords.find(
    (item) => item.status === PAYROLL_STATUS.REJECTED
  );

  if (rejectedRecord) {
    throw new Error("Recalculate rejected payroll before month approval");
  }

  const advancedRecord = monthRecords.find(
    (item) => !REVIEWABLE_STATUSES.has(item.status)
  );

  if (advancedRecord) {
    throw new Error(
      "Payroll month has already entered approval or locking and cannot be partially approved"
    );
  }

  const unresolvedDispute = monthRecords.find(
    (item) => item.employee_dispute && !item.dispute_resolved
  );

  if (unresolvedDispute) {
    throw new Error(
      `Resolve employee dispute before month approval: ${unresolvedDispute.staff_name || "Employee"}`
    );
  }

  const unacknowledgedRecord = monthRecords.find(
    (item) => !item.employee_acknowledged
  );

  if (unacknowledgedRecord) {
    throw new Error(
      `Employee acknowledgement required before month approval: ${unacknowledgedRecord.staff_name || "Employee"}`
    );
  }

  const approvedAt = new Date().toISOString();

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("payroll_records")
    .update({
      status: PAYROLL_STATUS.APPROVED,
      approved_by: approvedBy,
      approved_at: approvedAt,
    })
    .eq("organization_id", organizationId)
    .eq("entity_id", record.entity_id)
    .eq("payroll_month", record.payroll_month)
    .in("status", [
      PAYROLL_STATUS.GENERATED,
      PAYROLL_STATUS.RECALCULATED,
    ])
    .select("*");

  if (updateError) throw updateError;

  await createPayrollAuditLog({
    organizationId,
    payrollPeriod: record.payroll_month,
    action: "PAYROLL_MONTH_APPROVED",
    performedBy: actorName,
    notes: `Approved ${(updated || []).length} payroll records for ${record.payroll_month}`,
  });

  return {
    success: true,
    payrollMonth: record.payroll_month,
    entityId: record.entity_id,
    approvedCount: (updated || []).length,
    records: updated || [],
  };
}
