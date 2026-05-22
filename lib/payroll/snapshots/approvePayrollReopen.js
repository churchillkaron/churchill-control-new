import {
  PAYROLL_STATUS,
} from "@/lib/payroll/consolidation/payrollStatusMachine";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import reopenPayrollPeriod
from "@/lib/payroll/snapshots/reopenPayrollPeriod";

import createPayrollAuditLog
from "@/lib/payroll/audit/createPayrollAuditLog";

export default async function approvePayrollReopen({

  requestId,

  approvedBy,

  role = "STAFF",

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
      "Unauthorized reopen approval"
    );

  }

  // =========================
  // LOAD REQUEST
  // =========================

  const {
    data: request,
    error: requestError,
  } = await supabaseAdmin

    .from(
      "payroll_reopen_requests"
    )

    .select("*")

    .eq(
      "id",
      requestId
    )

    .single();

  if (requestError) {
    throw requestError;
  }

  // =========================
  // UPDATE REQUEST
  // =========================

  const {
    error: updateError,
  } = await supabaseAdmin

    .from(
      "payroll_reopen_requests"
    )

    .update({

      status:
        PAYROLL_STATUS.APPROVED,

      approved_by:
        approvedBy,

      approved_at:
        new Date().toISOString(),

    })

    .eq(
      "id",
      requestId
    );

  if (updateError) {
    throw updateError;
  }

  // =========================
  // EXECUTE REOPEN
  // =========================

  await reopenPayrollPeriod({

    tenantId:
      request.tenant_id,

    payrollPeriod:
      request.payroll_period,

    reopenedBy:
      approvedBy,

    role,

    reason:
      request.reason,

  });

  // =========================
  // AUDIT
  // =========================

  await createPayrollAuditLog({

    tenantId:
      request.tenant_id,

    payrollPeriod:
      request.payroll_period,

    action:
      "PAYROLL_REOPEN_APPROVED",

    performedBy:
      approvedBy,

    notes:
      `Payroll reopen approved for ${request.payroll_period}`,

  });

  return {

    success: true,

  };

}
