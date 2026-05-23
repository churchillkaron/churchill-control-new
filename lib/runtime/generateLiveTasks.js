export default function generateLiveTasks({

  tables = [],

  orders = [],

  vipTables = [],

  kitchenIssues = {},

}) {

  const tasks = [];

  // =====================================
  // VIP TASKS
  // =====================================

  vipTables.forEach((table) => {

    tasks.push({

      type: "VIP",

      priority: "HIGH",

      title:
        `VIP Service • Table ${table.table_number || table.name}`,

      description:
        "Deliver elite hospitality and premium upselling experience.",

    });

  });

  // =====================================
  // KITCHEN RECOVERY
  // =====================================

  if (
    kitchenIssues.pressure ===
    "HIGH"
  ) {

    tasks.push({

      type: "RECOVERY",

      priority: "HIGH",

      title:
        "Kitchen Recovery Flow",

      description:
        "Communicate delays proactively and stabilize guest experience.",

    });

  }

  // =====================================
  // SALES TASKS
  // =====================================

  if (
    orders.length > 10
  ) {

    tasks.push({

      type: "SALES",

      priority: "MEDIUM",

      title:
        "Premium Upsell Push",

      description:
        "Focus on wine pairings and premium cocktail upgrades.",

    });

  }

  return tasks;

}
