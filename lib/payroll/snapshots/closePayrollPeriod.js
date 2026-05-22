import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export default async function closePayrollPeriod({

  tenantId,

  payrollPeriod,

  finalizedBy = "SYSTEM",

}) {

  const {
    error,
  } = await supabaseAdmin

    .from(
      "payroll_snapshots"
    )

    .update({

      period_closed:
        true,

      finalized_at:
        new Date().toISOString(),

      finalized_by:
        finalizedBy,

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

  return {

    success: true,

  };

}
