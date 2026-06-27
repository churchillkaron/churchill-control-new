import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export default async function calculateDepartmentProfitability({

  organizationId,

  startDate,

  endDate,

}) {

  // =====================================
  // LOAD REVENUE
  // =====================================

  const {
    data: orders,
    error: ordersError,
  } = await supabaseAdmin

    .from(
      "orders"
    )

    .select("*")

    .eq(
      "organization_id",
      organizationId
    )

    .gte(
      "created_at",
      startDate
    )

    .lte(
      "created_at",
      endDate
    );

  if (ordersError) {

    throw ordersError;

  }

  // =====================================
  // LOAD PAYROLL
  // =====================================

  const {
    data: payroll,
    error: payrollError,
  } = await supabaseAdmin

    .from(
      "payroll_records"
    )

    .select("*")

    .eq(
      "organization_id",
      organizationId
    );

  if (payrollError) {

    throw payrollError;

  }

  // =====================================
  // DEPARTMENT BUCKETS
  // =====================================

  const departments = {

    FOH: {
      revenue: 0,
      labor: 0,
    },

    BAR: {
      revenue: 0,
      labor: 0,
    },

    KITCHEN: {
      revenue: 0,
      labor: 0,
    },

    MARKETING: {
      revenue: 0,
      labor: 0,
    },

  };

  // =====================================
  // REVENUE ALLOCATION
  // =====================================

  for (const order of orders) {

    const revenue =
      Number(
        order.final_total || 0
      );

    departments.FOH.revenue +=
      revenue * 0.7;

    departments.BAR.revenue +=
      revenue * 0.3;

  }

  // =====================================
  // LABOR ALLOCATION
  // =====================================

  for (const record of payroll) {

    const department =
      record.department_cost_center || "FOH";

    if (
      !departments[
        department
      ]
    ) {

      continue;

    }

    departments[
      department
    ].labor +=

      Number(
        record.final_salary || 0
      );

  }

  // =====================================
  // PROFITABILITY
  // =====================================

  const result = {};

  for (
    const [
      department,
      values,
    ] of Object.entries(
      departments
    )
  ) {

    result[
      department
    ] = {

      revenue:
        Number(
          values.revenue.toFixed(2)
        ),

      labor:
        Number(
          values.labor.toFixed(2)
        ),

      contribution:
        Number(
          (
            values.revenue -
            values.labor
          ).toFixed(2)
        ),

      laborRatio:

        values.revenue > 0

          ? Number(
              (
                (
                  values.labor /
                  values.revenue
                ) * 100
              ).toFixed(2)
            )

          : 0,

    };

  }

  return result;

}
