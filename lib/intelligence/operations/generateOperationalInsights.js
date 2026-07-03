export default function generateOperationalInsights({

  operationalContext,

  vipTables,

  kitchenIssues,

}) {

  const insights = [];

  // =====================================
  // VIP INSIGHT
  // =====================================

  if (
    vipTables.length > 0
  ) {

    insights.push({

      type: "VIP",

      title:
        "Luxury Upsell Opportunity",

      insight:
        "High-value guests detected. Recommend premium champagne and bottle presentation service.",

    });

  }

  // =====================================
  // FULFILLMENT INSIGHT
  // =====================================

  if (
    kitchenIssues.pressure ===
    "HIGH"
  ) {

    insights.push({

      type: "FULFILLMENT",

      title:
        "Guest Recovery Recommended",

      insight:
        "Kitchen delays increasing. Prioritize communication and complimentary recovery actions.",

    });

  }

  // =====================================
  // SALES INSIGHT
  // =====================================

  if (
    operationalContext.revenueToday >
    50000
  ) {

    insights.push({

      type: "SALES",

      title:
        "High Revenue Momentum",

      insight:
        "Guest spending is elevated tonight. Push premium experiences aggressively.",

    });

  }

  return insights;

}
