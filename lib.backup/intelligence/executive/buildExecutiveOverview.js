import buildRevenueIntelligence from "@/lib/intelligence/revenue/buildRevenueIntelligence";
import buildOperationalHealth from "@/lib/intelligence/operations/buildOperationalHealth";
import buildCustomerInsights from "@/lib/intelligence/customers/buildCustomerInsights";
import buildDemandForecast from "@/lib/intelligence/forecasting/buildDemandForecast";

export default async function buildExecutiveOverview({
  tenant_id,
}) {

  try {

    const [
      revenue,
      operations,
      customers,
      forecast,
    ] = await Promise.all([

      buildRevenueIntelligence({
        tenant_id,
      }),

      buildOperationalHealth({
        tenant_id,
      }),

      buildCustomerInsights({
        tenant_id,
      }),

      buildDemandForecast({
        tenant_id,
      }),
    ]);

    return {
      success: true,

      revenue,
      operations,
      customers,
      forecast,

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
