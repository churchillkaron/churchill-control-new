export default function generateRealtimeRecommendations({

  tables = [],

  orders = [],

  context = {},

}) {

  const recommendations = [];

  // =====================================
  // VIP RECOMMENDATIONS
  // =====================================

  tables.forEach((table) => {

    const spend =
      Number(
        table.total_spent || 0
      );

    if (spend > 15000) {

      recommendations.push({

        type: "VIP",

        table:
          table.table_number ||
          table.name,

        recommendation:
          "Offer premium champagne presentation and personalized service.",

      });

    }

  });

  // =====================================
  // ORDER VOLUME
  // =====================================

  if (
    orders.length > 15
  ) {

    recommendations.push({

      type: "OPERATIONS",

      recommendation:
        "High order volume detected. Increase floor coordination and communication.",

    });

  }

  // =====================================
  // LOW REVENUE PUSH
  // =====================================

  if (
    context.revenueToday < 30000
  ) {

    recommendations.push({

      type: "SALES",

      recommendation:
        "Push premium cocktails and wine pairings aggressively.",

    });

  }

  return recommendations;

}
