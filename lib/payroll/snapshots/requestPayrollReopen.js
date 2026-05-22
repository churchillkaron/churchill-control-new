import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import createPayrollAuditLog
from "@/lib/payroll/audit/createPayrollAuditLog";

export default async function requestPayrollReopen({

  tenantId,

  payrollPeriod,

  requestedBy,

  reason = "",

}) {

  const {
    error,
  } = await supabaseAdmin

    .from(
      "payroll_reopen_requests"
    )

    .insert({

      tenant_id:
        tenantId,

      payroll_period:
        payrollPeriod,

      requested_by:
        requestedBy,

      reason,

      status:
        "PENDING",

    });

  if (error) {
    throw error;
  }

  await createPayrollAuditLog({

    tenantId,

    payrollPeriod,

    action:
      "PAYROLL_REOPEN_REQUESTED",

    performedBy:
      requestedBy,

    notes:
      reason ||

      `Payroll reopen requested for ${payrollPeriod}`,

  });

  return {

    success: true,

  };

}
