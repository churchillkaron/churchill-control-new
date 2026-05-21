import buildExecutiveOverview from "@/lib/intelligence/executive/buildExecutiveOverview";

import buildPerformanceInsights from "@/lib/intelligence/performance/buildPerformanceInsights";

import detectAnomalies from "@/lib/intelligence/anomaly/detectAnomalies";

export default async function buildLiveCommandCenter({
  tenant_id,
}) {

  try {

    const [
      executive,
      performance,
      anomalies,
    ] = await Promise.all([

      buildExecutiveOverview({
        tenant_id,
      }),

      buildPerformanceInsights({
        tenant_id,
      }),

      detectAnomalies({
        tenant_id,
      }),
    ]);

    const alerts = [];

    if (
      anomalies.anomaly_count > 0
    ) {

      alerts.push(
        `${anomalies.anomaly_count} anomalies detected`
      );
    }

    if (
      performance.performance ===
      "CRITICAL"
    ) {

      alerts.push(
        "Critical operational performance"
      );
    }

    return {
      success: true,

      revenue:
        executive?.revenue
          ?.total_revenue || 0,

      operations:
        executive?.operations
          ?.status || "UNKNOWN",

      performance:
        performance?.performance || "UNKNOWN",

      customers:
        executive?.customers
          ?.total_customers || 0,

      forecast:
        executive?.forecast
          ?.projected_monthly_orders || 0,

      alerts,

      updated_at:
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
