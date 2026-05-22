import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import createPayrollAuditLog
from "@/lib/payroll/audit/createPayrollAuditLog";

export default async function reopenPayrollPeriod({

  tenantId,

  payrollPeriod,

  reopenedBy = "SYSTEM",

  role = "STAFF",

  reason = "",

}) {

  // =========================
  // AUTHORIZATION
  // =========================

  const allowedRoles = [

    "OWNER",

    "ACCOUNTING_ADMIN",

    "SUPER_ADMIN",

  ];

  if (
    !allowedRoles.includes(
      role
    )
  ) {

    throw new Error(
      "Unauthorized payroll reopen"
    );

  }

  const {
    error,
  } = await supabaseAdmin

    .from(
      "payroll_snapshots"
    )

    .update({

      period_closed:
        false,

    })

    .eq(
      "tenant_id",
      tenantId
    )

    .eq(
      "payroll_period",
      payrollPeriod
    );

  if (error) {
    throw error;
  }

  await createPayrollAuditLog({

    tenantId,

    payrollPeriod,

    action:
      "PAYROLL_PERIOD_REOPENED",

    performedBy:
      reopenedBy,

    notes:
      reason ||

      `Payroll period ${payrollPeriod} reopened`,

  });

  return {

    success: true,

  };

}
