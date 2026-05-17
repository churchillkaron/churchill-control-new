import buildExecutiveOverview from "@/lib/intelligence/executive/buildExecutiveOverview";

import buildOperationalRecommendations from "@/lib/intelligence/recommendations/buildOperationalRecommendations";

import buildPerformanceInsights from "@/lib/intelligence/performance/buildPerformanceInsights";

import buildRevenueForecast from "@/lib/finance/forecasting/buildRevenueForecast";

import getInsightMemory from "@/lib/intelligence/memory/getInsightMemory";

export default async function buildOwnerResponse({
  tenant_id,
  question,
}) {

  try {

    const [
      overview,
      recommendations,
      performance,
      forecast,
      memory,
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

      getInsightMemory({
        tenant_id,
        category:
          "owner_agent",
      }),
    ]);

    const revenue =
      overview?.revenue
        ?.total_revenue || 0;

    const operations =
      overview?.operations
        ?.status || "UNKNOWN";

    const customers =
      overview?.customers
        ?.total_customers || 0;

    const projected =
      forecast
        ?.projected_30_day_revenue || 0;

    const performanceLevel =
      performance
        ?.performance || "UNKNOWN";

    const recommendation =
      recommendations
        ?.recommendations?.[0]
        ?.message ||
      "Maintain operational consistency.";

    const memoryCount =
      memory?.memory
        ?.length || 0;

    const q =
      question?.toLowerCase() || "";

    let answer = "";

    if (
      q.includes("revenue")
    ) {

      answer =
`Revenue analysis complete.

Current revenue: ${revenue}
30-day forecast: ${projected}

Revenue health:
${overview?.revenue?.revenue_status}

AI recommendation:
${recommendation}`;
    }

    else if (
      q.includes("customer")
    ) {

      answer =
`Customer intelligence summary.

Tracked customers: ${customers}
Average spend: ${overview?.customers?.average_customer_spend}

The business is currently ${
customers > 50
? "building repeat customer momentum."
: "still early in customer acquisition."
}`;
    }

    else if (
      q.includes("staff")
    ) {

      answer =
`Staff and operations overview.

Performance level:
${performanceLevel}

Operational state:
${operations}

Completion rate:
${performance?.completion_rate}%`;
    }

    else if (
      q.includes("forecast")
    ) {

      answer =
`Forecasting engine analysis.

Projected 30-day revenue:
${projected}

Demand level:
${overview?.forecast?.demand_status}

Operational recommendation:
${recommendation}`;
    }

    else if (
      q.includes("memory")
    ) {

      answer =
`Churchill AI currently holds ${memoryCount} operational memory snapshots for this tenant.

These memories are used for:
- pattern recognition
- operational recommendations
- forecasting context
- executive summaries`;
    }

    else {

      answer =
`Churchill AI Executive Summary

Revenue:
${revenue}

Operations:
${operations}

Performance:
${performanceLevel}

Customers:
${customers}

30-Day Projection:
${projected}

Strategic Recommendation:
${recommendation}

Memory Snapshots:
${memoryCount}`;
    }

    return {
      success: true,
      answer,
      context: {
        revenue,
        operations,
        performance:
          performanceLevel,
        customers,
        projected,
        memoryCount,
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
