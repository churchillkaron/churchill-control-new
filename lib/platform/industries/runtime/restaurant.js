export const restaurantRuntime = {
  id: "restaurant",
  name: "Restaurant",

  modules: [
    { id: "operations", name: "Operations", category: "Core" },
    { id: "pos", name: "POS", category: "Core" },
    { id: "kitchen", name: "Kitchen", category: "Core" },
    { id: "reservations", name: "Reservations", category: "Core" },
    { id: "crm", name: "CRM", category: "Core" },
    { id: "finance", name: "Finance", category: "Core" },
    { id: "payroll", name: "Payroll", category: "Core" },
    { id: "marketing_ai", name: "Marketing AI", category: "AI" }
  ],

  dashboards: [
    { id: "revenue", name: "Revenue" },
    { id: "service", name: "Service" },
    { id: "staff", name: "Staff" }
  ],

  operations: {
    entity: "table",

    sections: [
      "Lounge",
      "Restaurant",
      "Terrace",
      "Bar"
    ],

    cards: [
      "revenue",
      "openRevenue",
      "avgCheck",
      "paidOrders",
      "openOrders"
    ],

    priorities: [
      "READY_FOR_PAYMENT",
      "FOOD_READY",
      "ACTIVE",
      "AVAILABLE"
    ],

    actions: [
      "payment",
      "merge",
      "split",
      "transfer",
      "moveGuests",
      "print"
    ]
  }
};
