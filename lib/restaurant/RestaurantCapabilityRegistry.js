export const RESTAURANT_CAPABILITIES = {
  restaurant: {
    session: {
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
