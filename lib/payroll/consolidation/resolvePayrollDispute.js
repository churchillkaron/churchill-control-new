import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import createPayrollAuditLog from "@/lib/payroll/audit/createPayrollAuditLog";
import {
  PAYROLL_STATUS,
  canTransition,
} from "@/lib/payroll/consolidation/payrollStatusMachine";

export default async function resolvePayrollDispute({
  payrollRecordId,
  organizationId,
  resolvedBy,
  resolutionNotes = "",
  role = "PAYROLL_ADMIN",
}) {
  const allowedRoles = [
    "OWNER",
    "ACCOUNTING_ADMIN",
    "PAYROLL_ADMIN",
    "MANAGER",
  ];

  if (!allowedRoles.includes(String(role || "").toUpperCase())) {
    throw new Error("Unauthorized dispute resolution");
  }

  if (!payrollRecordId) throw new Error("payrollRecordId required");
  if (!organizationId) throw new Error("organizationId required");
  if (!resolvedBy) throw new Error("resolvedBy required");

  const { data: record, error: recordError } = await supabaseAdmin
    .from("payroll_records")
    .select("*")
    .eq("id", payrollRecordId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (recordError) throw recordError;
  if (!record) throw new Error("Payroll record not found");

  if (!canTransition(record.status, PAYROLL_STATUS.RESOLVED)) {
    throw new Error(
      `Invalid payroll transition from ${record.status} to RESOLVED`
    );
  }

  const { error: updateError } = await supabaseAdmin
    .from("payroll_records")
    .update({
      dispute_resolved: true,
      dispute_resolution_notes: resolutionNotes,
      dispute_resolved_by: resolvedBy,
      dispute_resolved_at: new Date().toISOString(),
      status: PAYROLL_STATUS.RESOLVED,
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
    notes:
      resolutionNotes ||
      `Payroll dispute resolved for ${record.staff_name}`,
  });

  return { success: true };
}
