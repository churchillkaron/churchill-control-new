export const RestaurantRuntime = {
  domain: "restaurant",
  name: "Restaurant Operations",
  version: "1.0.0",

  contracts: () =>
    import("@/lib/restaurant/contracts"),

  queries: {

    order: () =>
      import("@/lib/restaurant/queries/orders/GetOrder"),

    kitchen: () =>
      import("@/lib/restaurant/queries/kitchen/GetKitchenTicket"),

    payment: () =>
      import("@/lib/restaurant/queries/payments/GetPayment"),

    session: () =>
      import("@/lib/restaurant/queries/sessions/GetSession"),

  },

  workflows: {

    RestaurantService: () =>
      import("@/lib/restaurant/workflows/RestaurantService/execute"),

    ServiceLifecycle: () =>
      import("@/lib/restaurant/workflows/ServiceLifecycle/execute"),

  },

  
capabilities: {

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
      CreateRestaurantOrder: () =>
        import("@/lib/restaurant/orders/CreateRestaurantOrder/execute"),

      AddItem: () =>
        import("@/lib/restaurant/orders/AddItem/execute"),

      RemoveItem: () =>
        import("@/lib/restaurant/orders/RemoveItem/execute"),

      UpdateQuantity: () =>
        import("@/lib/restaurant/orders/UpdateQuantity/execute"),

      ApplyDiscount: () =>
        import("@/lib/restaurant/orders/ApplyDiscount/execute"),
    },

    payments: {

      CreatePayment: () =>
        import("@/lib/restaurant/payments/workflows/CreatePayment"),

      CompletePayment: () =>
        import("@/lib/restaurant/payments/workflows/CompletePayment"),

    },

    session: {
      OpenSession: () =>
        import("@/lib/restaurant/session/OpenSession/execute"),

      CloseSession: () =>
        import("@/lib/restaurant/session/CloseSession/execute"),

      ChangeCustomer: () =>
        import("@/lib/restaurant/session/ChangeCustomer/execute"),

      MoveGuests: () =>
        import("@/lib/restaurant/session/workflows/MoveGuests"),

      SplitSessionGroup: () =>
        import("@/lib/restaurant/session/workflows/SplitSessionGroup"),

      GetActiveSession: () =>
        import("@/lib/restaurant/session/workflows/GetActiveSession"),

      GetLiveSessionState: () =>
        import("@/lib/restaurant/session/workflows/GetLiveSessionState"),

      LoadMergedSessionOrders: () =>
        import("@/lib/restaurant/session/workflows/LoadMergedSessionOrders"),
    },
  },
};
