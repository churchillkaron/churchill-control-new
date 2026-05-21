import buildExecutiveOverview from "@/lib/intelligence/executive/buildExecutiveOverview";

import buildInvestorIntelligenceEngine from "@/lib/intelligence/investor/buildInvestorIntelligenceEngine";

import buildNeuralForecastEngine from "@/lib/intelligence/neural/buildNeuralForecastEngine";

import buildPredictiveAnomalyEngine from "@/lib/intelligence/anomaly/buildPredictiveAnomalyEngine";

export default async function buildAIStrategicPlanningEngine({
  tenant_id,
}) {

  try {

    const [
      executive,
      investor,
      neural,
      anomaly,
    ] = await Promise.all([

      buildExecutiveOverview({
        tenant_id,
      }),

      buildInvestorIntelligenceEngine({
        tenant_id,
      }),

      buildNeuralForecastEngine({
        tenant_id,
      }),

      buildPredictiveAnomalyEngine({
        tenant_id,
      }),
    ]);

    const revenue =
      Number(
        executive?.revenue
          ?.total_revenue || 0
      );

    const customers =
      Number(
        executive?.customers
          ?.total_customers || 0
      );

    const valuation =
      Number(
        investor?.investor_snapshot
          ?.estimated_valuation || 0
      );

    const trend =
      Number(
        neural?.baseline
          ?.trend || 0
      );

    const anomalies =
      Number(
        anomaly?.anomaly_count || 0
      );

    const strategies = [];

    if (
      trend > 0
    ) {

      strategies.push({

        category:
          "EXPANSION",

        priority:
          "HIGH",

        objective:
          "Scale business operations and market reach.",

        initiatives: [

          "Open new locations",

          "Increase marketing investment",

          "Expand franchise partnerships",
        ],
      });
    }

    if (
      anomalies > 2
    ) {

      strategies.push({

        category:
          "RISK_CONTROL",

        priority:
          "HIGH",

        objective:
          "Reduce operational and financial risk exposure.",

        initiatives: [

          "Increase compliance monitoring",

          "Review operational inefficiencies",

          "Strengthen executive governance",
        ],
      });
    }

    if (
      customers < 500
    ) {

      strategies.push({

        category:
          "CUSTOMER_GROWTH",

        priority:
          "MEDIUM",

        objective:
          "Increase customer acquisition and retention.",

        initiatives: [

          "Launch retention campaigns",

          "Improve customer experience",

          "Increase digital engagement",
        ],
      });
    }

    if (
      valuation > 1000000
    ) {

      strategies.push({

        category:
          "INVESTMENT",

        priority:
          "MEDIUM",

        objective:
          "Prepare enterprise investment expansion.",

        initiatives: [

          "Prepare investor board reports",

          "Strengthen forecasting systems",

          "Expand enterprise partnerships",
        ],
      });
    }

    return {

      success: true,

      strategic_summary: {

        revenue,

        customers,

        valuation,

        growth_trend:
          trend,

        anomalies,
      },

      strategies,

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
