export const RESTAURANT_CAPABILITIES = {
  restaurant: {
    session: {
      OpenSession: {
        path: "@/lib/restaurant/session/OpenSession/execute",
        type: "action",
      },

      CloseSession: {
        path: "@/lib/restaurant/session/CloseSession/execute",
        type: "action",
      },

      MoveGuests: {
        path: "@/lib/restaurant/session/MoveGuests/execute",
        type: "action",
      },

      SplitSessionGroup: {
        path: "@/lib/restaurant/session/SplitSessionGroup/execute",
        type: "action",
      },

      GetActiveSession: {
        path: "@/lib/restaurant/session/GetActiveSession/execute",
        type: "query",
      },

      GetLiveSessionState: {
        path: "@/lib/restaurant/session/GetLiveSessionState/execute",
        type: "query",
      },

      LoadMergedSessionOrders: {
        path: "@/lib/restaurant/session/LoadMergedSessionOrders/execute",
        type: "query",
      },
    },
  },
};
