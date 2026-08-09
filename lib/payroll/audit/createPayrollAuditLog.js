import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function createPayrollAuditLog({
  organizationId,
  payrollPeriod,
  action,
  performedBy,
  targetStaffId = null,
  targetPartyId = null,
  notes = "",
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const { error } = await supabaseAdmin
    .from("payroll_audit_logs")
    .insert({
      organization_id: organizationId,
      payroll_period: payrollPeriod,
      action,
      performed_by: performedBy,
      target_staff_id: targetStaffId,
      target_party_id: targetPartyId,
      notes,
    });

  if (error) throw error;

  return { success: true };
}
