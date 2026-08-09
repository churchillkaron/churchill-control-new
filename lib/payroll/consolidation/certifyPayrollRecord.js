import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import createPayrollAuditLog from "@/lib/payroll/audit/createPayrollAuditLog";
import {
  PAYROLL_STATUS,
  canTransition,
} from "@/lib/payroll/consolidation/payrollStatusMachine";
import isPayrollImmutable from "@/lib/payroll/consolidation/isPayrollImmutable";

export default async function certifyPayrollRecord({
  payrollRecordId,
  organizationId,
  certifiedBy,
  role = "OWNER",
}) {
  const allowedRoles = [
    "OWNER",
    "ACCOUNTING_ADMIN",
  ];

  if (!allowedRoles.includes(String(role || "").toUpperCase())) {
    throw new Error("Unauthorized payroll certification");
  }

  if (!payrollRecordId) throw new Error("payrollRecordId required");
  if (!organizationId) throw new Error("organizationId required");
  if (!certifiedBy) throw new Error("certifiedBy required");

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

  if (!canTransition(record.status, PAYROLL_STATUS.CERTIFIED)) {
    throw new Error(
      `Invalid payroll transition from ${record.status} to CERTIFIED`
    );
  }

  const { error: updateError } = await supabaseAdmin
    .from("payroll_records")
    .update({
      payroll_certified: true,
      payroll_certified_by: certifiedBy,
      payroll_certified_at: new Date().toISOString(),
      status: PAYROLL_STATUS.CERTIFIED,
    })
    .eq("id", payrollRecordId)
    .eq("organization_id", organizationId);

  if (updateError) throw updateError;

  await createPayrollAuditLog({
    organizationId,
    payrollPeriod: record.payroll_month,
    action: "PAYROLL_CERTIFIED",
    performedBy: certifiedBy,
    targetStaffId: record.staff_id,
    targetPartyId: record.party_id || null,
    notes: `Payroll certified for ${record.staff_name}`,
  });

  return { success: true };
}
