import buildExecutiveOverview from "@/lib/intelligence/executive/buildExecutiveOverview";

import buildOperationalRecommendations from "@/lib/intelligence/recommendations/buildOperationalRecommendations";

import storeInsightMemory from "@/lib/intelligence/memory/storeInsightMemory";

import createAlert from "@/lib/alerts/createAlert";

export default async function runAutonomousAnalysis({
  tenant_id,
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

    const payload = {
      overview,
      recommendations,
      analyzed_at:
        new Date().toISOString(),
    };

    await storeInsightMemory({
      tenant_id,
      category:
        "autonomous_analysis",
      payload,
    });

    const operationalStatus =
      overview?.operations
        ?.status;

    if (
      operationalStatus ===
      "CRITICAL"
    ) {

      await createAlert({
        tenant_id,
        severity:
          "critical",
        message:
          "Critical operational status detected by AI.",
      });
    }

    return {
      success: true,
      payload,
    };

  } catch (error) {

    return {
      success: false,
      error:
        error.message,
    };
  }
}
