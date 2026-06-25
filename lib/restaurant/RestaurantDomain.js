export const RESTAURANT_DOMAIN = {
  id: "restaurant",
  name: "Restaurant Operations",
  description:
    "Restaurant operational domain for floor, sessions, orders, kitchen, bar, reservations, menu, customers, production and restaurant-side payments.",

  capabilities: {
    floor: [
      "layout",
      "zones",
      "tables",
      "seats",
      "merge",
      "transfer",
      "split",
      "clean",
      "availability",
    ],

    session: [
      "open",
      "close",
      "changeCustomer",
      "moveGuests",
      "transferTable",
      "mergeTables",
      "splitTable",
      "liveState",
      "timeline",
    ],

    orders: [
      "create",
      "addItem",
      "modifyItem",
      "removeItem",
      "send",
      "fire",
      "hold",
      "void",
      "recall",
    ],

    kitchen: [
      "queue",
      "station",
      "prepare",
      "ready",
      "expo",
      "delay",
    ],

    bar: [
      "queue",
      "prepare",
      "ready",
    ],

    reservations: [
      "create",
      "checkIn",
      "assignTable",
      "waitlist",
      "noShow",
    ],

    customers: [
      "profile",
      "visitHistory",
      "preferences",
      "allergies",
    ],

    menu: [
      "categories",
      "items",
      "modifiers",
      "combos",
      "availability",
      "pricing",
    ],

    production: [
      "recipes",
      "prep",
      "consumption",
      "waste",
      "costing",
    ],

    payments: [
      "bill",
      "split",
      "partial",
      "discount",
      "serviceCharge",
      "tips",
      "closeBill",
    ],

    staff: [
      "roles",
      "stations",
      "shift",
      "performance",
    ],

    analytics: [
      "turnover",
      "averageSpend",
      "waitTime",
      "kitchenTime",
      "topSellers",
      "guestCount",
    ],
  },
};
