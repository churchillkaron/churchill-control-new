export const RestaurantRuntime = {
  domain: "restaurant",
  name: "Restaurant Operations",
  version: "1.0.0",

  contracts: () => import("@/lib/restaurant/contracts"),

  queries: {
    order: () => import("@/lib/restaurant/queries/orders/GetOrder"),
    kitchen: () => import("@/lib/restaurant/queries/kitchen/GetKitchenTicket"),
    payment: () => import("@/lib/restaurant/queries/payments/GetPayment"),
    session: () => import("@/lib/restaurant/queries/sessions/GetSession"),
  },

  capabilities: {
    posTableActions: {
      MoveGuests: () =>
        import("@/lib/restaurant/pos/capabilities/tableActions/MoveGuests/execute"),
      CloseTable: () =>
        import("@/lib/restaurant/pos/capabilities/tableActions/CloseTable/execute"),
      TransferTable: () =>
        import("@/lib/restaurant/pos/capabilities/tableActions/TransferTable/execute"),
      MergeTables: () =>
        import("@/lib/restaurant/pos/capabilities/tableActions/MergeTables/execute"),
      MoveSeat: () =>
        import("@/lib/restaurant/pos/capabilities/tableActions/MoveSeat/moveSeatRuntime"),
    },

    kitchen: {
      CreateKitchenTicket: () =>
        import("@/lib/restaurant/kitchen/workflows/CreateKitchenTicket"),
      StartPreparation: () =>
        import("@/lib/restaurant/kitchen/workflows/StartPreparation"),
      MarkReady: () =>
        import("@/lib/restaurant/kitchen/workflows/MarkReady"),
      Complete: () =>
        import("@/lib/restaurant/kitchen/workflows/CompleteKitchenTicket"),
    },

    orders: {
      AddItem: () => import("@/lib/restaurant/orders/AddItem/execute"),
      RemoveItem: () => import("@/lib/restaurant/orders/RemoveItem/execute"),
      UpdateQuantity: () =>
        import("@/lib/restaurant/orders/UpdateQuantity/execute"),
      ApplyDiscount: () =>
        import("@/lib/restaurant/orders/ApplyDiscount/execute"),
    },

    session: {
      ChangeCustomer: () =>
        import("@/lib/restaurant/session/ChangeCustomer/execute"),
    },
  },
};
