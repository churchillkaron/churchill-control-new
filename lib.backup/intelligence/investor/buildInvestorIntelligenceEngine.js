import buildExecutiveOverview from "@/lib/intelligence/executive/buildExecutiveOverview";

import buildNeuralForecastEngine from "@/lib/intelligence/neural/buildNeuralForecastEngine";

import buildCustomerLifetimeValueAI from "@/lib/intelligence/customers/buildCustomerLifetimeValueAI";

import buildFranchiseIntelligenceNetwork from "@/lib/intelligence/franchise/buildFranchiseIntelligenceNetwork";

export default async function buildInvestorIntelligenceEngine({
  tenant_id,
}) {

  try {

    const [
      executive,
      neural,
      customers,
      franchise,
    ] = await Promise.all([

      buildExecutiveOverview({
        tenant_id,
      }),

      buildNeuralForecastEngine({
        tenant_id,
      }),

      buildCustomerLifetimeValueAI({
        tenant_id,
      }),

      buildFranchiseIntelligenceNetwork(),
    ]);

    const revenue =
      Number(
        executive?.revenue
          ?.total_revenue || 0
      );

    const customersCount =
      Number(
        customers?.summary
          ?.total_customers || 0
      );

    const avgRevenue =
      Number(
        neural?.baseline
          ?.average_revenue || 0
      );

    const growthTrend =
      Number(
        neural?.baseline
          ?.trend || 0
      );

    let valuationMultiple =
      3;

    if (
      growthTrend > 0
    ) {

      valuationMultiple =
        5;
    }

    if (
      customersCount > 1000
    ) {

      valuationMultiple += 1;
    }

    const estimatedValuation =
      Number(
        (
          revenue *
          valuationMultiple
        ).toFixed(2)
      );

    const investmentScore =
      Math.min(
        100,
        Math.max(
          10,
          Math.floor(
            (
              valuationMultiple * 15
            ) +
            (
              growthTrend / 1000
            )
          )
        )
      );

    return {

      success: true,

      investor_snapshot: {

        estimated_valuation:
          estimatedValuation,

        valuation_multiple:
          valuationMultiple,

        investment_score:
          investmentScore,

        average_revenue:
          avgRevenue,

        customer_base:
          customersCount,

        franchise_locations:
          franchise?.total_locations || 0,
      },

      forecasting:
        neural?.forecasts?.slice(
          0,
          12
        ) || [],

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
