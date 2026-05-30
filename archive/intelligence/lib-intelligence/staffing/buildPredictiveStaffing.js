import { supabaseAdmin } from "@/lib/shared/supabase/admin";

import buildRevenueForecast from "@/lib/finance/forecasting/buildRevenueForecast";

export default async function buildPredictiveStaffing({
  tenant_id,
}) {

  try {

    const forecast =
      await buildRevenueForecast({
        tenant_id,
      });

    const {
      data: staff,
      error,
    } = await supabaseAdmin
      .from("staff_accounts")
      .select(`
        id,
        name,
        role,
        department
      `)
      .eq(
        "tenant_id",
        tenant_id
      );

    if (error) {
      throw error;
    }

    const projectedRevenue =
      Number(
        forecast
          ?.projected_30_day_revenue || 0
      );

    let staffingLevel =
      "NORMAL";

    let recommendation =
      "Maintain current staffing.";

    if (
      projectedRevenue >
      500000
    ) {

      staffingLevel =
        "HIGH_DEMAND";

      recommendation =
        "Increase staffing coverage for projected demand.";
    }

    if (
      projectedRevenue <
      100000
    ) {

      staffingLevel =
        "LOW_DEMAND";

      recommendation =
        "Optimize staffing schedule and reduce idle labor.";
    }

    const departments = {};

    for (const member of staff || []) {

      const dept =
        member.department ||
        "UNKNOWN";

      if (
        !departments[
          dept
        ]
      ) {

        departments[
          dept
        ] = {

          department:
            dept,

          staff_count: 0,
        };
      }

      departments[
        dept
      ].staff_count += 1;
    }

    return {

      success: true,

      staffing_level:
        staffingLevel,

      recommendation,

      projected_revenue:
        projectedRevenue,

      departments:
        Object.values(
          departments
        ),

      total_staff:
        staff?.length || 0,

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
