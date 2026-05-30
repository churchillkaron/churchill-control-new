export default function generateAIActions({

  vipTables = [],

  kitchenIssues = {},

  operationalContext = {},

}) {

  const actions = [];

  // =====================================
  // VIP ACTIONS
  // =====================================

  vipTables.forEach((table) => {

    actions.push({

      type: "VIP",

      action:
        "Deliver champagne recommendation",

      table:
        table.table_number ||
        table.name,

      urgency:
        "HIGH",

    });

  });

  // =====================================
  // KITCHEN ACTIONS
  // =====================================

  if (
    kitchenIssues.pressure ===
    "HIGH"
  ) {

    actions.push({

      type: "RECOVERY",

      action:
        "Prioritize delayed table recovery",

      urgency:
        "HIGH",

    });

  }

  // =====================================
  // SALES ACTIONS
  // =====================================

  if (
    operationalContext.revenueToday <
    30000
  ) {

    actions.push({

      type: "SALES",

      action:
        "Push premium cocktail upsells",

      urgency:
        "MEDIUM",

    });

  }

  return actions;

}
