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
        import("@/lib/restaurant/kitchen/CreateKitchenTicket/execute"),

      StartPreparation: () =>
        import("@/lib/restaurant/kitchen/StartPreparation/execute"),

      MarkReady: () =>
        import("@/lib/restaurant/kitchen/MarkReady/execute"),

      Complete: () =>
        import("@/lib/restaurant/kitchen/Complete/execute"),

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
        import("@/lib/restaurant/payments/CreatePayment/execute"),

      CompletePayment: () =>
        import("@/lib/restaurant/payments/CompletePayment/execute"),

    },

    session: {
      OpenSession: () =>
        import("@/lib/restaurant/session/OpenSession/execute"),

      CloseSession: () =>
        import("@/lib/restaurant/session/CloseSession/execute"),

      ChangeCustomer: () =>
        import("@/lib/restaurant/session/ChangeCustomer/execute"),

      MoveGuests: () =>
        import("@/lib/restaurant/session/MoveGuests/execute"),

      SplitSessionGroup: () =>
        import("@/lib/restaurant/session/SplitSessionGroup/execute"),

      GetActiveSession: () =>
        import("@/lib/restaurant/session/GetActiveSession/execute"),

      GetLiveSessionState: () =>
        import("@/lib/restaurant/session/GetLiveSessionState/execute"),

      LoadMergedSessionOrders: () =>
        import("@/lib/restaurant/session/LoadMergedSessionOrders/execute"),
    },
  },
};
