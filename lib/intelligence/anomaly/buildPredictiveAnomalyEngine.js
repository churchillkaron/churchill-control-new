import buildExecutiveOverview from "@/lib/intelligence/executive/buildExecutiveOverview";

import buildDemandPredictionAI from "@/lib/intelligence/demand/buildDemandPredictionAI";

import buildInventoryForecastAI from "@/lib/intelligence/inventory/buildInventoryForecastAI";

import buildPayrollIntelligence from "@/lib/intelligence/payroll/buildPayrollIntelligence";

export default async function buildPredictiveAnomalyEngine({
  tenant_id,
}) {

  try {

    const [
      executive,
      demand,
      inventory,
      payroll,
    ] = await Promise.all([

      buildExecutiveOverview({
        tenant_id,
      }),

      buildDemandPredictionAI({
        tenant_id,
      }),

      buildInventoryForecastAI({
        tenant_id,
      }),

      buildPayrollIntelligence({
        tenant_id,
      }),
    ]);

    const anomalies = [];

    const revenue =
      Number(
        executive?.revenue
          ?.total_revenue || 0
      );

    if (
      revenue < 50000
    ) {

      anomalies.push({

        type:
          "LOW_REVENUE",

        severity:
          "HIGH",

        prediction:
          "Revenue performance below operational threshold.",

        recommendation:
          "Increase campaign activity and review demand trends.",
      });
    }

    const criticalInventory =
      inventory?.forecast?.filter(
        (item) =>
          item.risk ===
          "CRITICAL"
      ) || [];

    if (
      criticalInventory.length > 0
    ) {

      anomalies.push({

        type:
          "CRITICAL_INVENTORY",

        severity:
          "HIGH",

        prediction:
          `${criticalInventory.length} inventory items at critical depletion risk.`,

        recommendation:
          "Immediate procurement intervention required.",
      });
    }

    const payrollPenalties =
      Number(
        payroll?.payroll_summary
          ?.total_penalties || 0
      );

    if (
      payrollPenalties > 10000
    ) {

      anomalies.push({

        type:
          "PAYROLL_DISCIPLINE",

        severity:
          "MEDIUM",

        prediction:
          "Elevated payroll penalties detected.",

        recommendation:
          "Review attendance and operational discipline policies.",
      });
    }

    const peakRevenue =
      Number(
        demand?.peak_day
          ?.revenue || 0
      );

    const lowRevenue =
      Number(
        demand?.lowest_day
          ?.revenue || 0
      );

    if (
      peakRevenue >
      lowRevenue * 3
    ) {

      anomalies.push({

        type:
          "DEMAND_VOLATILITY",

        severity:
          "MEDIUM",

        prediction:
          "Large revenue volatility detected between operational days.",

        recommendation:
          "Improve weekday retention and balancing strategies.",
      });
    }

    return {

      success: true,

      anomaly_count:
        anomalies.length,

      anomalies,

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
