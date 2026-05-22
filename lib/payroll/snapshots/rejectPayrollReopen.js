import {
  PAYROLL_STATUS,
} from "@/lib/payroll/consolidation/payrollStatusMachine";

import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import createPayrollAuditLog
from "@/lib/payroll/audit/createPayrollAuditLog";

export default async function rejectPayrollReopen({

  requestId,

  rejectedBy,

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
      "Unauthorized reopen rejection"
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
  // REJECT REQUEST
  // =========================

  const {
    error: updateError,
  } = await supabaseAdmin

    .from(
      "payroll_reopen_requests"
    )

    .update({

      status:
        PAYROLL_STATUS.REJECTED,

      approved_by:
        rejectedBy,

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
  // AUDIT
  // =========================

  await createPayrollAuditLog({

    tenantId:
      request.tenant_id,

    payrollPeriod:
      request.payroll_period,

    action:
      "PAYROLL_REOPEN_REJECTED",

    performedBy:
      rejectedBy,

    notes:
      reason ||

      `Payroll reopen rejected for ${request.payroll_period}`,

  });

  return {

    success: true,

  };

}
