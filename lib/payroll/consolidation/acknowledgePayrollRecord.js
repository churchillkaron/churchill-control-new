import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import createPayrollAuditLog from "@/lib/payroll/audit/createPayrollAuditLog";

export default async function acknowledgePayrollRecord({
  payrollRecordId,
  organizationId,
  staffId,
  partyId = null,
  staffName,
}) {
  if (!payrollRecordId) throw new Error("payrollRecordId required");
  if (!organizationId) throw new Error("organizationId required");
  if (!staffId) throw new Error("staffId required");

  const { data: record, error: recordError } = await supabaseAdmin
    .from("payroll_records")
    .select("*")
    .eq("id", payrollRecordId)
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId)
    .maybeSingle();

  if (recordError) throw recordError;
  if (!record) throw new Error("Payroll record not found for staff member");

  if (partyId && record.party_id && record.party_id !== partyId) {
    throw new Error("Payroll record party mismatch");
  }

  if (record.employee_dispute && !record.dispute_resolved) {
    throw new Error("Resolve payroll dispute before acknowledgement");
  }

  const { error: updateError } = await supabaseAdmin
    .from("payroll_records")
    .update({
      employee_acknowledged: true,
      employee_acknowledged_at: new Date().toISOString(),
    })
    .eq("id", payrollRecordId)
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId);

  if (updateError) throw updateError;

  await createPayrollAuditLog({
    organizationId,
    payrollPeriod: record.payroll_month,
    action: "PAYROLL_ACKNOWLEDGED",
    performedBy: staffName,
    targetStaffId: record.staff_id,
    targetPartyId: record.party_id || partyId,
    notes: `Payroll acknowledged by ${staffName}`,
  });

  return { success: true };
}
