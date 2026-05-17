import buildExecutiveOverview from "@/lib/intelligence/executive/buildExecutiveOverview";

import buildInvestorIntelligenceEngine from "@/lib/intelligence/investor/buildInvestorIntelligenceEngine";

import buildPredictiveAnomalyEngine from "@/lib/intelligence/anomaly/buildPredictiveAnomalyEngine";

import buildNeuralForecastEngine from "@/lib/intelligence/neural/buildNeuralForecastEngine";

export default async function buildAIBoardAdvisor({
  tenant_id,
}) {

  try {

    const [
      executive,
      investor,
      anomalies,
      neural,
    ] = await Promise.all([

      buildExecutiveOverview({
        tenant_id,
      }),

      buildInvestorIntelligenceEngine({
        tenant_id,
      }),

      buildPredictiveAnomalyEngine({
        tenant_id,
      }),

      buildNeuralForecastEngine({
        tenant_id,
      }),
    ]);

    const recommendations = [];

    const revenue =
      Number(
        executive?.revenue
          ?.total_revenue || 0
      );

    const valuation =
      Number(
        investor?.investor_snapshot
          ?.estimated_valuation || 0
      );

    const investmentScore =
      Number(
        investor?.investor_snapshot
          ?.investment_score || 0
      );

    const anomalyCount =
      Number(
        anomalies?.anomaly_count || 0
      );

    const trend =
      Number(
        neural?.baseline
          ?.trend || 0
      );

    if (
      trend > 0
    ) {

      recommendations.push({

        category:
          "EXPANSION",

        priority:
          "HIGH",

        recommendation:
          "Revenue trend is positive. Consider expansion opportunities and new locations.",
      });
    }

    if (
      anomalyCount > 3
    ) {

      recommendations.push({

        category:
          "RISK",

        priority:
          "HIGH",

        recommendation:
          "Operational anomaly count is elevated. Immediate executive review recommended.",
      });
    }

    if (
      investmentScore > 70
    ) {

      recommendations.push({

        category:
          "INVESTMENT",

        priority:
          "MEDIUM",

        recommendation:
          "Business investment profile is strong. Prepare investor materials and growth strategy.",
      });
    }

    if (
      revenue < 100000
    ) {

      recommendations.push({

        category:
          "OPERATIONS",

        priority:
          "MEDIUM",

        recommendation:
          "Revenue performance below strategic target. Increase marketing and customer retention focus.",
      });
    }

    return {

      success: true,

      board_summary: {

        revenue,

        valuation,

        investment_score:
          investmentScore,

        anomalies:
          anomalyCount,

        growth_trend:
          trend,
      },

      recommendations,

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
