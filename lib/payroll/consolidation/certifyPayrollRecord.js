import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import createPayrollAuditLog
from "@/lib/payroll/audit/createPayrollAuditLog";

import {
  PAYROLL_STATUS,
  canTransition,
} from "@/lib/payroll/consolidation/payrollStatusMachine";

import isPayrollImmutable
from "@/lib/payroll/consolidation/isPayrollImmutable";

export default async function certifyPayrollRecord({

  payrollRecordId,

  certifiedBy,

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
      "Unauthorized payroll certification"
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
    isPayrollImmutable(
      record.status
    )
  ) {

    throw new Error(
      "Archived payroll is immutable"
    );

  }

  if (
    !canTransition(
      record.status,
      PAYROLL_STATUS.CERTIFIED
    )
  ) {

    throw new Error(
      `Invalid payroll transition from ${record.status} to CERTIFIED`
    );

  }

  const {
    error: updateError,
  } = await supabaseAdmin

    .from(
      "payroll_records"
    )

    .update({

      payroll_certified:
        true,

      payroll_certified_by:
        certifiedBy,

      payroll_certified_at:
        new Date().toISOString(),

      status:
        PAYROLL_STATUS.CERTIFIED,

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
      "PAYROLL_CERTIFIED",

    performedBy:
      certifiedBy,

    targetStaffId:
      record.staff_id,

    notes:
      `Payroll certified for ${record.staff_name}`,

  });

  return {

    success: true,

  };

}
