import buildExecutiveOverview from "@/lib/intelligence/executive/buildExecutiveOverview";

import buildOperationalRecommendations from "@/lib/intelligence/recommendations/buildOperationalRecommendations";

import buildPerformanceInsights from "@/lib/intelligence/performance/buildPerformanceInsights";

import buildRevenueForecast from "@/lib/finance/forecasting/buildRevenueForecast";

import storeInsightMemory from "@/lib/intelligence/memory/storeInsightMemory";

import createAlert from "@/lib/alerts/createAlert";

export default async function runFullIntelligenceCycle({
  tenant_id,
}) {

  try {

    const [
      executive,
      recommendations,
      performance,
      forecast,
    ] = await Promise.all([

      buildExecutiveOverview({
        tenant_id,
      }),

      buildOperationalRecommendations({
        tenant_id,
      }),

      buildPerformanceInsights({
        tenant_id,
      }),

      buildRevenueForecast({
        tenant_id,
      }),
    ]);

    const report = {

      executive,
      recommendations,
      performance,
      forecast,

      generated_at:
        new Date().toISOString(),
    };

    await storeInsightMemory({
      tenant_id,
      category:
        "full_intelligence_cycle",
      payload:
        report,
    });

    if (
      performance.performance ===
      "CRITICAL"
    ) {

      await createAlert({
        tenant_id,
        severity:
          "critical",
        message:
          "Critical performance state detected.",
      });
    }

    return {
      success: true,
      report,
    };

  } catch (error) {

    return {
      success: false,
      error:
        error.message,
    };
  }
}
