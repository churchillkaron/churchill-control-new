import buildExecutiveOverview from "@/lib/intelligence/executive/buildExecutiveOverview";

import buildPerformanceInsights from "@/lib/intelligence/performance/buildPerformanceInsights";

import buildOperationalRecommendations from "@/lib/intelligence/recommendations/buildOperationalRecommendations";

import runCorrectiveAction from "@/lib/intelligence/actions/runCorrectiveAction";

import publishEvent from "@/lib/intelligence/events/publishEvent";

export default async function runAutonomousDecisionEngine({
  tenant_id,
}) {

  try {

    const [
      executive,
      performance,
      recommendations,
    ] = await Promise.all([

      buildExecutiveOverview({
        tenant_id,
      }),

      buildPerformanceInsights({
        tenant_id,
      }),

      buildOperationalRecommendations({
        tenant_id,
      }),
    ]);

    const decisions = [];

    if (
      performance.performance ===
      "CRITICAL"
    ) {

      const action =
        await runCorrectiveAction({
          tenant_id,
          issue:
            "LOW_PERFORMANCE",
          severity:
            "critical",
        });

      decisions.push({
        type:
          "CORRECTIVE_ACTION",
        result:
          action,
      });

      await publishEvent({
        tenant_id,
        type:
          "AI_AUTONOMOUS_ACTION",
        payload: {
          issue:
            "LOW_PERFORMANCE",
        },
      });
    }

    if (
      executive?.revenue
        ?.revenue_status ===
      "LOW_AVERAGE_ORDER"
    ) {

      decisions.push({
        type:
          "REVENUE_OPTIMIZATION",
        recommendation:
          "Increase upselling and optimize menu pricing.",
      });
    }

    return {
      success: true,

      decisions,

      recommendations:
        recommendations
          ?.recommendations || [],

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
