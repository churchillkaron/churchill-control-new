import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import createPayrollAuditLog from "@/lib/payroll/audit/createPayrollAuditLog";
import {
  PAYROLL_STATUS,
  canTransition,
} from "@/lib/payroll/consolidation/payrollStatusMachine";
import isPayrollImmutable from "@/lib/payroll/consolidation/isPayrollImmutable";

export default async function closePayrollAccountingPeriod({
  payrollRecordId,
  organizationId,
  closedBy,
  role = "ACCOUNTING_ADMIN",
}) {
  const allowedRoles = [
    "OWNER",
    "ACCOUNTING_ADMIN",
  ];

  if (!allowedRoles.includes(String(role || "").toUpperCase())) {
    throw new Error("Unauthorized accounting close");
  }

  if (!payrollRecordId) throw new Error("payrollRecordId required");
  if (!organizationId) throw new Error("organizationId required");
  if (!closedBy) throw new Error("closedBy required");

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

  if (!canTransition(record.status, PAYROLL_STATUS.ACCOUNTING_CLOSED)) {
    throw new Error(
      `Invalid payroll transition from ${record.status} to ACCOUNTING_CLOSED`
    );
  }

  const { error: updateError } = await supabaseAdmin
    .from("payroll_records")
    .update({
      accounting_period_closed: true,
      accounting_period_closed_at: new Date().toISOString(),
      accounting_period_closed_by: closedBy,
      status: PAYROLL_STATUS.ACCOUNTING_CLOSED,
    })
    .eq("id", payrollRecordId)
    .eq("organization_id", organizationId);

  if (updateError) throw updateError;

  await createPayrollAuditLog({
    organizationId,
    payrollPeriod: record.payroll_month,
    action: "PAYROLL_ACCOUNTING_PERIOD_CLOSED",
    performedBy: closedBy,
    targetStaffId: record.staff_id,
    targetPartyId: record.party_id || null,
    notes: `Accounting period closed for ${record.staff_name}`,
  });

  return { success: true };
}
