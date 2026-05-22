import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export default async function createPayrollAuditLog({

  tenantId,

  payrollPeriod,

  action,

  performedBy,

  targetStaffId = null,

  notes = "",

}) {

  const {
    error,
  } = await supabaseAdmin

    .from(
      "payroll_audit_logs"
    )

    .insert({

      tenant_id:
        tenantId,

      payroll_period:
        payrollPeriod,

      action,

      performed_by:
        performedBy,

      target_staff_id:
        targetStaffId,

      notes,

    });

  if (error) {
    throw error;
  }

  return {

    success: true,

  };

}
