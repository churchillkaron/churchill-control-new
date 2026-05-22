import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

import loadTenantPayoutPolicy
from "@/lib/payroll/policies/loadTenantPayoutPolicy";

export default async function createPayrollSnapshot({

  tenantId,

  shiftId,

  staffPerformance = [],

}) {

  const policy =
    await loadTenantPayoutPolicy(
      tenantId
    );

  // =========================
  // CLOSED PERIOD CHECK
  // =========================

  const payrollPeriod =
    new Date()
      .toISOString()
      .slice(0, 7);

  const {
    data: existingClosed,
  } = await supabaseAdmin

    .from(
      "payroll_snapshots"
    )

    .select("id")

    .eq(
      "tenant_id",
      tenantId
    )

    .eq(
      "payroll_period",
      payrollPeriod
    )

    .eq(
      "period_closed",
      true
    )

    .limit(1);

  if (
    existingClosed &&
    existingClosed.length > 0
  ) {

    throw new Error(
      "Payroll period closed"
    );

  }

  for (
    const member of
    staffPerformance
  ) {

    const {
      error,
    } = await supabaseAdmin

      .from(
        "payroll_snapshots"
      )

      .insert({

        tenant_id:
          tenantId,

        shift_id:
          shiftId,

        staff_id:
          member.staff_id,

        staff_name:
          member.name,

        department:
          member.department,

        payout:
          member.payout || 0,

        multiplier:
          member.multiplier || 1,

        performance_level:
          member.level,

        revenue:
          member.revenue || 0,

        total_orders:
          member.totalOrders || 0,

        average_order_value:
          member.averageOrderValue || 0,

        payroll_period:
          payrollPeriod,

        payout_model:
          policy?.payout_model,

        service_charge_percentage:
          policy?.service_charge_percentage || 0,

      });

    if (error) {
      throw error;
    }

  }

  return {

    success: true,

  };

}
