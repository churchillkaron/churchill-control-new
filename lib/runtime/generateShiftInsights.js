export default function generateShiftInsights({

  orders = [],

  tables = [],

  payments = [],

}) {

  const insights = [];

  // =====================================
  // TABLE LOAD
  // =====================================

  if (
    tables.length > 10
  ) {

    insights.push({

      type: "FLOOR",

      level: "HIGH",

      title:
        "High Floor Activity",

      description:
        "Guest volume is increasing rapidly. Focus on table rotation and speed.",

    });

  }

  // =====================================
  // SALES MOMENTUM
  // =====================================

  const revenue =
    payments.reduce(
      (sum, p) =>
        sum +
        Number(
          p.amount_paid || 0
        ),
      0
    );

  if (
    revenue > 50000
  ) {

    insights.push({

      type: "SALES",

      level: "ELITE",

      title:
        "Luxury Revenue Momentum",

      description:
        "Premium guest spending is elevated tonight. Push bottle service and pairings.",

    });

  }

  // =====================================
  // ORDER LOAD
  // =====================================

  if (
    orders.length > 20
  ) {

    insights.push({

      type: "OPERATIONS",

      level: "PRESSURE",

      title:
        "Operational Pressure",

      description:
        "Kitchen and service coordination should be prioritized immediately.",

    });

  }

  return insights;

}
