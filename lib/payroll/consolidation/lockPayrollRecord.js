import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import createPayrollAuditLog from "@/lib/payroll/audit/createPayrollAuditLog";
import {
  PAYROLL_STATUS,
  canTransition,
} from "@/lib/payroll/consolidation/payrollStatusMachine";
import isPayrollImmutable from "@/lib/payroll/consolidation/isPayrollImmutable";

export default async function lockPayrollRecord({
  payrollRecordId,
  organizationId,
  lockedBy,
  actorName = "PAYROLL ADMIN",
  role = "PAYROLL_ADMIN",
}) {
  const allowedRoles = [
    "OWNER",
    "SUPER_ADMIN",
    "ACCOUNTING",
    "ACCOUNTING_ADMIN",
    "PAYROLL_ADMIN",
  ];

  if (!allowedRoles.includes(String(role || "").toUpperCase())) {
    throw new Error("Unauthorized payroll lock");
  }

  if (!payrollRecordId) throw new Error("payrollRecordId required");
  if (!organizationId) throw new Error("organizationId required");
  if (!lockedBy) throw new Error("lockedBy required");

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

  if (!canTransition(record.status, PAYROLL_STATUS.LOCKED)) {
    throw new Error(`Invalid payroll transition from ${record.status} to LOCKED`);
  }

  if (!record.employee_acknowledged) {
    throw new Error("Employee acknowledgement required before payroll lock");
  }

  if (record.employee_dispute && !record.dispute_resolved) {
    throw new Error("Resolve employee dispute before payroll lock");
  }

  if (!record.approved_by || !record.approved_at) {
    throw new Error("Manager approval required before payroll lock");
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("payroll_records")
    .update({
      status: PAYROLL_STATUS.LOCKED,
    })
    .eq("id", payrollRecordId)
    .eq("organization_id", organizationId)
    .select("*")
    .single();

  if (updateError) throw updateError;

  await createPayrollAuditLog({
    organizationId,
    payrollPeriod: record.payroll_month,
    action: "PAYROLL_RECORD_LOCKED",
    performedBy: actorName,
    targetStaffId: record.staff_id,
    targetPartyId: record.party_id || null,
    notes: `Payroll locked for ${record.staff_name}`,
  });

  return {
    success: true,
    record: updated,
  };
}
