export const RestaurantRuntime = {
  domain: "restaurant",
  name: "Restaurant Operations",
  version: "1.0.0",

  workflows: {

    RestaurantService: () =>
      import("@/lib/restaurant/workflows/RestaurantService/execute"),

  },

  
capabilities: {

    kitchen: {

      CreateKitchenTicket: () =>
        import("@/lib/restaurant/kitchen/CreateKitchenTicket/execute"),

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
