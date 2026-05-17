import buildExecutiveOverview from "@/lib/intelligence/executive/buildExecutiveOverview";

import buildPredictiveAnomalyEngine from "@/lib/intelligence/anomaly/buildPredictiveAnomalyEngine";

import buildInvestorIntelligenceEngine from "@/lib/intelligence/investor/buildInvestorIntelligenceEngine";

export default async function buildExecutiveMobileDashboard({
  tenant_id,
}) {

  try {

    const [
      executive,
      anomalies,
      investor,
    ] = await Promise.all([

      buildExecutiveOverview({
        tenant_id,
      }),

      buildPredictiveAnomalyEngine({
        tenant_id,
      }),

      buildInvestorIntelligenceEngine({
        tenant_id,
      }),
    ]);

    return {

      success: true,

      mobile_dashboard: {

        revenue:
          executive?.revenue
            ?.total_revenue || 0,

        customers:
          executive?.customers
            ?.total_customers || 0,

        active_anomalies:
          anomalies?.anomaly_count || 0,

        investment_score:
          investor
            ?.investor_snapshot
            ?.investment_score || 0,

        valuation:
          investor
            ?.investor_snapshot
            ?.estimated_valuation || 0,
      },

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
