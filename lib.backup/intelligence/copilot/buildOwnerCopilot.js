import buildExecutiveOverview from "@/lib/intelligence/executive/buildExecutiveOverview";

import buildOperationalRecommendations from "@/lib/intelligence/recommendations/buildOperationalRecommendations";

import detectAnomalies from "@/lib/intelligence/anomaly/detectAnomalies";

export default async function buildOwnerCopilot({
  tenant_id,
}) {

  try {

    const [
      executive,
      recommendations,
      anomalies,
    ] = await Promise.all([

      buildExecutiveOverview({
        tenant_id,
      }),

      buildOperationalRecommendations({
        tenant_id,
      }),

      detectAnomalies({
        tenant_id,
      }),
    ]);

    const tasks = [];

    if (
      anomalies.anomaly_count > 0
    ) {

      tasks.push({
        priority:
          "HIGH",
        task:
          "Review anomaly alerts immediately.",
      });
    }

    if (
      executive?.operations
        ?.status ===
      "WARNING"
    ) {

      tasks.push({
        priority:
          "MEDIUM",
        task:
          "Investigate operational bottlenecks.",
      });
    }

    if (
      executive?.revenue
        ?.revenue_status ===
      "LOW_AVERAGE_ORDER"
    ) {

      tasks.push({
        priority:
          "HIGH",
        task:
          "Increase upselling and menu optimization.",
      });
    }

    if (
      tasks.length === 0
    ) {

      tasks.push({
        priority:
          "NORMAL",
        task:
          "Operations stable. Maintain execution consistency.",
      });
    }

    return {
      success: true,

      summary: {
        revenue:
          executive?.revenue
            ?.total_revenue || 0,

        operations:
          executive?.operations
            ?.status || "UNKNOWN",

        customers:
          executive?.customers
            ?.total_customers || 0,

        anomalies:
          anomalies
            ?.anomaly_count || 0,
      },

      recommendations:
        recommendations
          ?.recommendations || [],

      tasks,

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
