import buildExecutiveOverview from "@/lib/intelligence/executive/buildExecutiveOverview";

import buildDemandPredictionAI from "@/lib/intelligence/demand/buildDemandPredictionAI";

import buildProductionCostingAI from "@/lib/intelligence/production/buildProductionCostingAI";

import buildPredictiveStaffing from "@/lib/intelligence/staffing/buildPredictiveStaffing";

export default async function buildRestaurantDigitalTwin({
  tenant_id,
}) {

  try {

    const [
      executive,
      demand,
      production,
      staffing,
    ] = await Promise.all([

      buildExecutiveOverview({
        tenant_id,
      }),

      buildDemandPredictionAI({
        tenant_id,
      }),

      buildProductionCostingAI({
        tenant_id,
      }),

      buildPredictiveStaffing({
        tenant_id,
      }),
    ]);

    const revenue =
      Number(
        executive?.revenue
          ?.total_revenue || 0
      );

    const avgMargin =
      Number(
        production?.summary
          ?.average_margin || 0
      );

    const staffingLevel =
      staffing?.staffing_level ||
      "NORMAL";

    const peakDay =
      demand?.peak_day
        ?.day || "-";

    const simulations = [];

    simulations.push({

      scenario:
        "INCREASE_MENU_PRICES_10",

      projected_revenue:
        Number(
          (
            revenue * 1.1
          ).toFixed(2)
        ),

      projected_margin:
        Number(
          (
            avgMargin + 5
          ).toFixed(2)
        ),

      impact:
        "Higher profitability with moderate customer sensitivity.",
    });

    simulations.push({

      scenario:
        "REDUCE_LABOR_15",

      projected_payroll_savings:
        Number(
          (
            revenue * 0.05
          ).toFixed(2)
        ),

      operational_risk:
        staffingLevel ===
        "HIGH_DEMAND"
          ? "HIGH"
          : "MEDIUM",

      impact:
        "Reduced labor cost but increased operational pressure.",
    });

    simulations.push({

      scenario:
        "BOOST_MARKETING_20",

      projected_revenue:
        Number(
          (
            revenue * 1.18
          ).toFixed(2)
        ),

      peak_day:
        peakDay,

      impact:
        "Expected traffic increase with stronger customer acquisition.",
    });

    return {

      success: true,

      baseline: {

        revenue,

        average_margin:
          avgMargin,

        staffing_level:
          staffingLevel,

        peak_day:
          peakDay,
      },

      simulations,

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
