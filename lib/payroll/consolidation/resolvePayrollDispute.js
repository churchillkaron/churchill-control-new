import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import createPayrollAuditLog from "@/lib/payroll/audit/createPayrollAuditLog";
import { PAYROLL_STATUS } from "@/lib/payroll/consolidation/payrollStatusMachine";

const ALLOWED_ROLES = new Set([
  "OWNER",
  "SUPER_ADMIN",
  "MANAGER",
  "ACCOUNTING",
  "ACCOUNTING_ADMIN",
  "PAYROLL_ADMIN",
]);

const REVIEWABLE_STATUSES = new Set([
  PAYROLL_STATUS.GENERATED,
  PAYROLL_STATUS.RECALCULATED,
]);

export default async function resolvePayrollDispute({
  payrollRecordId,
  organizationId,
  resolvedBy,
  resolutionNotes = "",
  role = "PAYROLL_ADMIN",
}) {
  const normalizedRole = String(role || "").trim().toUpperCase();
  const notes = String(resolutionNotes || "").trim();

  if (!ALLOWED_ROLES.has(normalizedRole)) {
    throw new Error("Unauthorized dispute resolution");
  }

  if (!payrollRecordId) throw new Error("payrollRecordId required");
  if (!organizationId) throw new Error("organizationId required");
  if (!resolvedBy) throw new Error("resolvedBy required");
  if (!notes) throw new Error("resolutionNotes required");

  const { data: record, error: recordError } = await supabaseAdmin
    .from("payroll_records")
    .select("*")
    .eq("id", payrollRecordId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (recordError) throw recordError;
  if (!record) throw new Error("Payroll record not found");

  if (!REVIEWABLE_STATUSES.has(record.status)) {
    throw new Error("Only pre-approval payroll disputes can be resolved here");
  }

  if (!record.employee_dispute || record.dispute_resolved) {
    throw new Error("No unresolved employee payroll dispute exists");
  }

  const { error: updateError } = await supabaseAdmin
    .from("payroll_records")
    .update({
      dispute_resolved: true,
      dispute_resolution_notes: notes,
      dispute_resolved_by: resolvedBy,
      dispute_resolved_at: new Date().toISOString(),
    })
    .eq("id", payrollRecordId)
    .eq("organization_id", organizationId);

  if (updateError) throw updateError;

  await createPayrollAuditLog({
    organizationId,
    payrollPeriod: record.payroll_month,
    action: "PAYROLL_DISPUTE_RESOLVED",
    performedBy: resolvedBy,
    targetStaffId: record.staff_id,
    targetPartyId: record.party_id || null,
    notes,
  });

  return { success: true };
}
