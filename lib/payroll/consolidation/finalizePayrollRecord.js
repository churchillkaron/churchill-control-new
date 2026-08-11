import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import createPayrollAuditLog from "@/lib/payroll/audit/createPayrollAuditLog";
import {
  PAYROLL_STATUS,
  canTransition,
} from "@/lib/payroll/consolidation/payrollStatusMachine";

const ALLOWED_ROLES = new Set([
  "OWNER",
  "ACCOUNTING_ADMIN",
  "PAYROLL_ADMIN",
]);

const FINALIZABLE_STATUSES = new Set([
  PAYROLL_STATUS.PAID,
  PAYROLL_STATUS.RESOLVED,
  PAYROLL_STATUS.FINALIZED,
]);

export default async function finalizePayrollRecord({
  payrollRecordId,
  organizationId,
  finalizedBy,
  role = "ACCOUNTING_ADMIN",
}) {
  if (!ALLOWED_ROLES.has(String(role || "").toUpperCase())) {
    throw new Error("Unauthorized payroll finalization");
  }

  if (!payrollRecordId) throw new Error("payrollRecordId required");
  if (!organizationId) throw new Error("organizationId required");
  if (!finalizedBy) throw new Error("finalizedBy required");

  const { data: record, error: recordError } = await supabaseAdmin
    .from("payroll_records")
    .select("*")
    .eq("id", payrollRecordId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (recordError) throw recordError;
  if (!record) throw new Error("Payroll record not found");

  if (!record.entity_id) {
    throw new Error("Payroll legal entity is required before finalization");
  }

  if (!record.payroll_month) {
    throw new Error("Payroll month is required before finalization");
  }

  if (
    record.status !== PAYROLL_STATUS.FINALIZED &&
    !canTransition(record.status, PAYROLL_STATUS.FINALIZED)
  ) {
    throw new Error(
      `Invalid payroll transition from ${record.status} to FINALIZED`
    );
  }

  const { data: monthRecords, error: monthError } = await supabaseAdmin
    .from("payroll_records")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", record.entity_id)
    .eq("payroll_month", record.payroll_month);

  if (monthError) throw monthError;
  if (!monthRecords?.length) throw new Error("Payroll month not found");

  const invalidStatus = monthRecords.find(
    (item) => !FINALIZABLE_STATUSES.has(item.status)
  );

  if (invalidStatus) {
    throw new Error(
      `Payroll month cannot be finalized while ${invalidStatus.staff_name || "an employee"} is ${invalidStatus.status}`
    );
  }

  const unresolvedDispute = monthRecords.find(
    (item) => item.employee_dispute && !item.dispute_resolved
  );

  if (unresolvedDispute) {
    throw new Error(
      `Resolve payroll dispute before month finalization: ${unresolvedDispute.staff_name || "Employee"}`
    );
  }

  const paidWithoutEvidence = monthRecords.find(
    (item) =>
      [PAYROLL_STATUS.PAID, PAYROLL_STATUS.RESOLVED].includes(item.status) &&
      (!item.payment_reference || !item.payout_date)
  );

  if (paidWithoutEvidence) {
    throw new Error(
      `Payment evidence required before month finalization: ${paidWithoutEvidence.staff_name || "Employee"}`
    );
  }

  const recordsToFinalize = monthRecords.filter(
    (item) => [PAYROLL_STATUS.PAID, PAYROLL_STATUS.RESOLVED].includes(item.status)
  );

  if (recordsToFinalize.length === 0) {
    return {
      success: true,
      payrollMonth: record.payroll_month,
      entityId: record.entity_id,
      finalizedCount: 0,
      alreadyFinalized: true,
      records: monthRecords,
    };
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("payroll_records")
    .update({
      status: PAYROLL_STATUS.FINALIZED,
    })
    .eq("organization_id", organizationId)
    .eq("entity_id", record.entity_id)
    .eq("payroll_month", record.payroll_month)
    .in("status", [PAYROLL_STATUS.PAID, PAYROLL_STATUS.RESOLVED])
    .select("*");

  if (updateError) throw updateError;

  const { data: finalRecords, error: finalError } = await supabaseAdmin
    .from("payroll_records")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("entity_id", record.entity_id)
    .eq("payroll_month", record.payroll_month);

  if (finalError) throw finalError;

  const notFinalized = (finalRecords || []).find(
    (item) => item.status !== PAYROLL_STATUS.FINALIZED
  );

  if (notFinalized) {
    throw new Error(
      "Payroll month changed during finalization; refresh and review before retrying"
    );
  }

  await createPayrollAuditLog({
    organizationId,
    payrollPeriod: record.payroll_month,
    action: "PAYROLL_MONTH_FINALIZED",
    performedBy: finalizedBy,
    notes: `Finalized ${(updated || []).length} payroll records for ${record.payroll_month}`,
  });

  return {
    success: true,
    payrollMonth: record.payroll_month,
    entityId: record.entity_id,
    finalizedCount: (updated || []).length,
    alreadyFinalized: false,
    records: finalRecords || [],
  };
}
