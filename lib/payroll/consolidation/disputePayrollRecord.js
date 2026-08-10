import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import createPayrollAuditLog from "@/lib/payroll/audit/createPayrollAuditLog";
import { PAYROLL_STATUS } from "@/lib/payroll/consolidation/payrollStatusMachine";

const REVIEWABLE_STATUSES = new Set([
  PAYROLL_STATUS.GENERATED,
  PAYROLL_STATUS.RECALCULATED,
]);

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

  const reason = String(disputeReason || "").trim();
  if (!reason) throw new Error("disputeReason required");

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

  if (!REVIEWABLE_STATUSES.has(record.status)) {
    throw new Error("Payroll disputes are only available before approval");
  }

  if (record.employee_acknowledged) {
    throw new Error("Acknowledged payroll cannot be disputed");
  }

  if (record.employee_dispute && !record.dispute_resolved) {
    throw new Error("An unresolved payroll dispute already exists");
  }

  const { error: updateError } = await supabaseAdmin
    .from("payroll_records")
    .update({
      employee_dispute: reason,
      dispute_resolved: false,
      dispute_resolution_notes: null,
      dispute_resolved_by: null,
      dispute_resolved_at: null,
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
    notes: reason,
  });

  return { success: true };
}
