import buildExecutiveOverview from "@/lib/intelligence/executive/buildExecutiveOverview";

import buildOperationalRecommendations from "@/lib/intelligence/recommendations/buildOperationalRecommendations";

export default async function buildOwnerResponse({
  tenant_id,
  question,
}) {

  try {

    const overview =
      await buildExecutiveOverview({
        tenant_id,
      });

    const recommendations =
      await buildOperationalRecommendations({
        tenant_id,
      });

    let answer =
      "System analysis completed.";

    if (
      question
        ?.toLowerCase()
        .includes("revenue")
    ) {

      answer =
        `Current revenue is ${overview.revenue?.total_revenue || 0}.`;
    }

    if (
      question
        ?.toLowerCase()
        .includes("operations")
    ) {

      answer =
        `Operational status is ${overview.operations?.status || "UNKNOWN"}.`;
    }

    if (
      question
        ?.toLowerCase()
        .includes("recommend")
    ) {

      answer =
        recommendations
          ?.recommendations?.[0]
          ?.message ||
        "No recommendations available.";
    }

    return {
      success: true,
      answer,
      overview,
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
