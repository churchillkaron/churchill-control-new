import buildPortfolioOverview from "@/lib/intelligence/multitenant/buildPortfolioOverview";

import publishEvent from "@/lib/intelligence/events/storeSystemEvent";

import createAlert from "@/lib/alerts/createAlert";

export default async function runExecutiveAutomation() {

  try {

    const portfolio =
      await buildPortfolioOverview();

    const actions = [];

    for (const location of portfolio.locations || []) {

      if (
        location.operations ===
        "CRITICAL"
      ) {

        await createAlert({
          tenant_id:
            location.tenant_id,
          severity:
            "critical",
          message:
            "Critical operations detected in portfolio monitoring.",
        });

        await publishEvent({
          tenant_id:
            location.tenant_id,
          type:
            "EXECUTIVE_AUTOMATION_ALERT",
          payload: {
            operations:
              location.operations,
            revenue:
              location.revenue,
          },
        });

        actions.push({
          tenant:
            location.tenant_name,
          action:
            "CRITICAL_ALERT_TRIGGERED",
        });
      }

      if (
        location.revenue < 10000
      ) {

        await publishEvent({
          tenant_id:
            location.tenant_id,
          type:
            "LOW_REVENUE_WARNING",
          payload: {
            revenue:
              location.revenue,
          },
        });

        actions.push({
          tenant:
            location.tenant_name,
          action:
            "LOW_REVENUE_WARNING",
        });
      }
    }

    return {
      success: true,
      portfolio_revenue:
        portfolio.portfolio_revenue,
      actions,
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
