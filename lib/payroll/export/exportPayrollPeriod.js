import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export default async function exportPayrollPeriod({

  tenantId,

  payrollPeriod,

}) {

  // =========================
  // LOAD SNAPSHOTS
  // =========================

  const {
    data: snapshots,
    error,
  } = await supabaseAdmin

    .from(
      "payroll_snapshots"
    )

    .select("*")

    .eq(
      "tenant_id",
      tenantId
    )

    .eq(
      "payroll_period",
      payrollPeriod
    )

    .order(
      "staff_name",
      {
        ascending: true,
      }
    );

  if (error) {
    throw error;
  }

  // =========================
  // TOTALS
  // =========================

  const totalPayout =
    (snapshots || []).reduce(
      (
        sum,
        snapshot
      ) =>

        sum +

        Number(
          snapshot.payout || 0
        ),

      0
    );

  const totalRevenue =
    (snapshots || []).reduce(
      (
        sum,
        snapshot
      ) =>

        sum +

        Number(
          snapshot.revenue || 0
        ),

      0
    );

  return {

    payroll_period:
      payrollPeriod,

    exported_at:
      new Date().toISOString(),

    total_staff:
      snapshots.length,

    total_payout:
      Number(
        totalPayout.toFixed(2)
      ),

    total_revenue:
      Number(
        totalRevenue.toFixed(2)
      ),

    snapshots,

  };

}
