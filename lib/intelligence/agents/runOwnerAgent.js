import buildExecutiveOverview from "@/lib/intelligence/executive/buildExecutiveOverview";
import buildOperationalRecommendations from "@/lib/intelligence/recommendations/buildOperationalRecommendations";
import storeInsightMemory from "@/lib/intelligence/memory/storeInsightMemory";

export default async function runOwnerAgent({
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

    const summary = {
      overview,
      recommendations,
      generated_at:
        new Date().toISOString(),
    };

    await storeInsightMemory({
      tenant_id,
      category:
        "owner_agent",
      payload:
        summary,
    });

    return {
      success: true,
      summary,
    };

  } catch (error) {

    return {
      success: false,
      error:
        error.message,
    };
  }
}
