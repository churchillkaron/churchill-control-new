import buildDemandPredictionAI from "@/lib/intelligence/demand/buildDemandPredictionAI";

import buildPredictiveStaffing from "@/lib/intelligence/staffing/buildPredictiveStaffing";

import buildProductionCostingAI from "@/lib/intelligence/production/buildProductionCostingAI";

import buildPayrollIntelligence from "@/lib/intelligence/payroll/buildPayrollIntelligence";

export default async function buildAutonomousOptimizationEngine({
  tenant_id,
}) {

  try {

    const [
      demand,
      staffing,
      production,
      payroll,
    ] = await Promise.all([

      buildDemandPredictionAI({
        tenant_id,
      }),

      buildPredictiveStaffing({
        tenant_id,
      }),

      buildProductionCostingAI({
        tenant_id,
      }),

      buildPayrollIntelligence({
        tenant_id,
      }),
    ]);

    const optimizations = [];

    if (
      demand?.peak_day?.revenue >
      demand?.lowest_day?.revenue * 2
    ) {

      optimizations.push({

        type:
          "DEMAND",

        priority:
          "HIGH",

        recommendation:
          `Increase staffing and inventory for ${demand.peak_day.day}.`,
      });
    }

    if (
      staffing?.staffing_level ===
      "LOW_DEMAND"
    ) {

      optimizations.push({

        type:
          "STAFFING",

        priority:
          "MEDIUM",

        recommendation:
          "Reduce labor exposure during low-demand periods.",
      });
    }

    const criticalMargins =
      production?.analysis?.filter(
        (item) =>
          item.health ===
          "CRITICAL"
      ) || [];

    if (
      criticalMargins.length > 0
    ) {

      optimizations.push({

        type:
          "MENU_ENGINEERING",

        priority:
          "HIGH",

        recommendation:
          `${criticalMargins.length} menu items have critical margins. Adjust pricing or recipe costs.`,
      });
    }

    if (
      payroll?.payroll_summary
        ?.total_penalties > 0
    ) {

      optimizations.push({

        type:
          "PAYROLL",

        priority:
          "LOW",

        recommendation:
          "Review payroll penalties and staff operational discipline.",
      });
    }

    return {

      success: true,

      optimization_count:
        optimizations.length,

      optimizations,

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
