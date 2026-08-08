import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import createPayrollAuditLog from "@/lib/payroll/audit/createPayrollAuditLog";
import {
  PAYROLL_STATUS,
  canTransition,
} from "@/lib/payroll/consolidation/payrollStatusMachine";
import isPayrollImmutable from "@/lib/payroll/consolidation/isPayrollImmutable";

export async function approvePayrollRecord({
  payrollRecordId,
  organizationId,
  approvedBy,
  actorName = "MANAGER",
  role = "MANAGER",
}) {
  const allowedRoles = [
    "OWNER",
    "SUPER_ADMIN",
    "ACCOUNTING",
    "ACCOUNTING_ADMIN",
    "PAYROLL_ADMIN",
    "MANAGER",
  ];

  if (!allowedRoles.includes(String(role || "").toUpperCase())) {
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

  if (record.employee_dispute && !record.dispute_resolved) {
    throw new Error("Resolve employee dispute before approval");
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("payroll_records")
    .update({
      status: PAYROLL_STATUS.APPROVED,
      approved_by: approvedBy,
      approved_at: new Date().toISOString(),
    })
    .eq("id", payrollRecordId)
    .eq("organization_id", organizationId)
    .select("*")
    .single();

  if (updateError) throw updateError;

  await createPayrollAuditLog({
    organizationId,
    payrollPeriod: record.payroll_month,
    action: "PAYROLL_RECORD_APPROVED",
    performedBy: actorName,
    targetStaffId: record.staff_id,
    targetPartyId: record.party_id || null,
    notes: `Payroll approved for ${record.staff_name}`,
  });

  return {
    success: true,
    record: updated,
  };
}
