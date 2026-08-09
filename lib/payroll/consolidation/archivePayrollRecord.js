import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import createPayrollAuditLog from "@/lib/payroll/audit/createPayrollAuditLog";
import {
  PAYROLL_STATUS,
  canTransition,
} from "@/lib/payroll/consolidation/payrollStatusMachine";

export default async function archivePayrollRecord({
  payrollRecordId,
  organizationId,
  archivedBy,
  role = "OWNER",
}) {
  const allowedRoles = [
    "OWNER",
    "ACCOUNTING_ADMIN",
  ];

  if (!allowedRoles.includes(String(role || "").toUpperCase())) {
    throw new Error("Unauthorized payroll archive");
  }

  if (!payrollRecordId) throw new Error("payrollRecordId required");
  if (!organizationId) throw new Error("organizationId required");
  if (!archivedBy) throw new Error("archivedBy required");

  const { data: record, error: recordError } = await supabaseAdmin
    .from("payroll_records")
    .select("*")
    .eq("id", payrollRecordId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (recordError) throw recordError;
  if (!record) throw new Error("Payroll record not found");

  if (!canTransition(record.status, PAYROLL_STATUS.ARCHIVED)) {
    throw new Error(
      `Invalid payroll transition from ${record.status} to ARCHIVED`
    );
  }

  const { error: updateError } = await supabaseAdmin
    .from("payroll_records")
    .update({
      archived: true,
      archived_at: new Date().toISOString(),
      archived_by: archivedBy,
      status: PAYROLL_STATUS.ARCHIVED,
    })
    .eq("id", payrollRecordId)
    .eq("organization_id", organizationId);

  if (updateError) throw updateError;

  await createPayrollAuditLog({
    organizationId,
    payrollPeriod: record.payroll_month,
    action: "PAYROLL_ARCHIVED",
    performedBy: archivedBy,
    targetStaffId: record.staff_id,
    targetPartyId: record.party_id || null,
    notes: `Payroll archived for ${record.staff_name}`,
  });

  return { success: true };
}
