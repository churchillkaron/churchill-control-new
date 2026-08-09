import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import createPayrollAuditLog from "@/lib/payroll/audit/createPayrollAuditLog";
import {
  PAYROLL_STATUS,
  canTransition,
} from "@/lib/payroll/consolidation/payrollStatusMachine";
import isPayrollImmutable from "@/lib/payroll/consolidation/isPayrollImmutable";

export default async function finalizePayrollRecord({
  payrollRecordId,
  organizationId,
  finalizedBy,
  role = "ACCOUNTING_ADMIN",
}) {
  const allowedRoles = [
    "OWNER",
    "ACCOUNTING_ADMIN",
    "PAYROLL_ADMIN",
  ];

  if (!allowedRoles.includes(String(role || "").toUpperCase())) {
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

  if (isPayrollImmutable(record.status)) {
    throw new Error("Archived payroll is immutable");
  }

  if (!canTransition(record.status, PAYROLL_STATUS.FINALIZED)) {
    throw new Error(
      `Invalid payroll transition from ${record.status} to FINALIZED`
    );
  }

  if (record.employee_dispute && !record.dispute_resolved) {
    throw new Error("Payroll dispute unresolved");
  }

  const { error: updateError } = await supabaseAdmin
    .from("payroll_records")
    .update({
      status: PAYROLL_STATUS.FINALIZED,
    })
    .eq("id", payrollRecordId)
    .eq("organization_id", organizationId);

  if (updateError) throw updateError;

  await createPayrollAuditLog({
    organizationId,
    payrollPeriod: record.payroll_month,
    action: "PAYROLL_FINALIZED",
    performedBy: finalizedBy,
    targetStaffId: record.staff_id,
    targetPartyId: record.party_id || null,
    notes: `Payroll finalized for ${record.staff_name}`,
  });

  return { success: true };
}
