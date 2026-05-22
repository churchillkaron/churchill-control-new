import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import createPayrollAuditLog
from "@/lib/payroll/audit/createPayrollAuditLog";

import {
  PAYROLL_STATUS,
  canTransition,
} from "@/lib/payroll/consolidation/payrollStatusMachine";

export default async function archivePayrollRecord({

  payrollRecordId,

  archivedBy,

  role = "OWNER",

}) {

  const allowedRoles = [

    "OWNER",

    "ACCOUNTING_ADMIN",

  ];

  if (
    !allowedRoles.includes(
      role
    )
  ) {

    throw new Error(
      "Unauthorized payroll archive"
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
      PAYROLL_STATUS.ARCHIVED
    )
  ) {

    throw new Error(
      `Invalid payroll transition from ${record.status} to ARCHIVED`
    );

  }

  const {
    error: updateError,
  } = await supabaseAdmin

    .from(
      "payroll_records"
    )

    .update({

      archived:
        true,

      archived_at:
        new Date().toISOString(),

      archived_by:
        archivedBy,

      status:
        PAYROLL_STATUS.ARCHIVED,

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
      "PAYROLL_ARCHIVED",

    performedBy:
      archivedBy,

    targetStaffId:
      record.staff_id,

    notes:
      `Payroll archived for ${record.staff_name}`,

  });

  return {

    success: true,

  };

}
