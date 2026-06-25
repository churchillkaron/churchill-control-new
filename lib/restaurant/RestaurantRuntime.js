export const RestaurantRuntime = {
  domain: "restaurant",
  name: "Restaurant Operations",
  version: "1.0.0",

  capabilities: {
    orders: {
      CreateRestaurantOrder: () =>
        import("@/lib/restaurant/orders/CreateRestaurantOrder/execute"),

      AddItem: () =>
        import("@/lib/restaurant/orders/AddItem/execute"),
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
