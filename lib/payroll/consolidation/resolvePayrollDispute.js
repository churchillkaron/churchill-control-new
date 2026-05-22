import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import createPayrollAuditLog
from "@/lib/payroll/audit/createPayrollAuditLog";

import {
  PAYROLL_STATUS,
  canTransition,
} from "@/lib/payroll/consolidation/payrollStatusMachine";

export default async function resolvePayrollDispute({

  payrollRecordId,

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

  if (
    !allowedRoles.includes(
      role
    )
  ) {

    throw new Error(
      "Unauthorized dispute resolution"
    );

  }

  const {
    data: record,
    error: recordError,
  } = await supabaseAdmin

    .from(
      "payroll_records"
    )

    .select("*")

    .eq(
      "id",
      payrollRecordId
    )

    .single();

  if (recordError) {
    throw recordError;
  }

  if (
    !canTransition(
      record.status,
      PAYROLL_STATUS.RESOLVED
    )
  ) {

    throw new Error(
      `Invalid payroll transition from ${record.status} to RESOLVED`
    );

  }

  const {
    error: updateError,
  } = await supabaseAdmin

    .from(
      "payroll_records"
    )

    .update({

      dispute_resolved:
        true,

      dispute_resolution_notes:
        resolutionNotes,

      dispute_resolved_by:
        resolvedBy,

      dispute_resolved_at:
        new Date().toISOString(),

      status:
        PAYROLL_STATUS.RESOLVED,

    })

    .eq(
      "id",
      payrollRecordId
    );

  if (updateError) {
    throw updateError;
  }

  await createPayrollAuditLog({

    tenantId:
      record.tenant_id,

    payrollPeriod:
      record.payroll_month,

    action:
      "PAYROLL_DISPUTE_RESOLVED",

    performedBy:
      resolvedBy,

    targetStaffId:
      record.staff_id,

    notes:
      resolutionNotes ||

      `Payroll dispute resolved for ${record.staff_name}`,

  });

  return {

    success: true,

  };

}
