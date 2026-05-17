import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function buildPayrollIntelligence({
  tenant_id,
}) {

  try {

    const {
      data: payroll,
      error,
    } = await supabaseAdmin
      .from("payroll")
      .select(`
        id,
        staff_name,
        department,
        salary,
        service_charge,
        penalties,
        final_payout,
        status
      `)
      .eq(
        "tenant_id",
        tenant_id
      )
      .limit(500);

    if (error) {
      throw error;
    }

    let totalPayroll = 0;

    let totalPenalties = 0;

    const departments = {};

    for (const row of payroll || []) {

      const payout =
        Number(
          row.final_payout || 0
        );

      const penalties =
        Number(
          row.penalties || 0
        );

      totalPayroll += payout;

      totalPenalties += penalties;

      const department =
        row.department ||
        "UNKNOWN";

      if (
        !departments[
          department
        ]
      ) {

        departments[
          department
        ] = {

          department,

          staff_count: 0,

          total_payout: 0,
        };
      }

      departments[
        department
      ].staff_count += 1;

      departments[
        department
      ].total_payout +=
        payout;
    }

    const rankedDepartments =
      Object.values(
        departments
      ).sort(
        (a, b) =>
          b.total_payout -
          a.total_payout
      );

    return {

      success: true,

      payroll_summary: {

        total_payroll:
          totalPayroll,

        total_penalties:
          totalPenalties,

        total_staff:
          payroll?.length || 0,
      },

      departments:
        rankedDepartments,

      payroll:
        payroll || [],

      generated_at:
        new Date().toISOString(),
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
