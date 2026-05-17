import buildRevenueForecast from "@/lib/finance/forecasting/buildRevenueForecast";

export default async function buildOperationalRecommendations({
  tenant_id,
}) {

  try {

    const forecast =
      await buildRevenueForecast({
        tenant_id,
      });

    const recommendations = [];

    if (
      forecast.projected_30_day_revenue <
      50000
    ) {

      recommendations.push({
        level: "warning",
        message:
          "Projected revenue is below target. Increase campaigns and upselling.",
      });
    }

    if (
      forecast.projected_30_day_revenue >=
      50000
    ) {

      recommendations.push({
        level: "good",
        message:
          "Revenue trend is healthy. Maintain operational consistency.",
      });
    }

    return {
      success: true,
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
