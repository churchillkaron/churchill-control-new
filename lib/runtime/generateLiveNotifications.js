export default function generateLiveNotifications({

  vipTables = [],

  kitchenIssues = {},

  operationalContext = {},

}) {

  const notifications = [];

  // =====================================
  // VIP ALERTS
  // =====================================

  vipTables.forEach((table) => {

    notifications.push({

      type: "VIP",

      priority: "HIGH",

      title:
        `VIP Table ${table.table_number || table.name}`,

      message:
        "High-value guest detected. Prioritize luxury service and premium upselling.",

    });

  });

  // =====================================
  // KITCHEN PRESSURE
  // =====================================

  if (
    kitchenIssues.pressure ===
    "HIGH"
  ) {

    notifications.push({

      type: "KITCHEN",

      priority: "HIGH",

      title:
        "Kitchen Pressure Rising",

      message:
        "Delayed orders detected. Increase guest communication immediately.",

    });

  }

  // =====================================
  // SALES PUSH
  // =====================================

  if (
    operationalContext.revenueToday <
    20000
  ) {

    notifications.push({

      type: "SALES",

      priority: "MEDIUM",

      title:
        "Revenue Push",

      message:
        "Focus on premium cocktails and champagne upgrades.",

    });

  }

  return notifications;

}
