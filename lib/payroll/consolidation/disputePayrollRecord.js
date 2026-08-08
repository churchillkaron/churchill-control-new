import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import createPayrollAuditLog from "@/lib/payroll/audit/createPayrollAuditLog";
import {
  PAYROLL_STATUS,
  canTransition,
} from "@/lib/payroll/consolidation/payrollStatusMachine";

export default async function disputePayrollRecord({
  payrollRecordId,
  organizationId,
  staffId,
  partyId = null,
  staffName,
  disputeReason,
}) {
  if (!payrollRecordId) throw new Error("payrollRecordId required");
  if (!organizationId) throw new Error("organizationId required");
  if (!staffId) throw new Error("staffId required");
  if (!String(disputeReason || "").trim()) throw new Error("disputeReason required");

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

  if (!canTransition(record.status, PAYROLL_STATUS.DISPUTED)) {
    throw new Error(`Invalid payroll transition from ${record.status} to DISPUTED`);
  }

  const { error: updateError } = await supabaseAdmin
    .from("payroll_records")
    .update({
      employee_dispute: String(disputeReason).trim(),
      dispute_resolved: false,
      status: PAYROLL_STATUS.DISPUTED,
    })
    .eq("id", payrollRecordId)
    .eq("organization_id", organizationId)
    .eq("staff_id", staffId);

  if (updateError) throw updateError;

  await createPayrollAuditLog({
    organizationId,
    payrollPeriod: record.payroll_month,
    action: "PAYROLL_DISPUTED",
    performedBy: staffName,
    targetStaffId: record.staff_id,
    targetPartyId: record.party_id || partyId,
    notes: String(disputeReason).trim(),
  });

  return { success: true };
}
