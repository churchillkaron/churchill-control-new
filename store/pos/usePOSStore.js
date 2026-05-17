import { create } from "zustand";

export const usePOSStore =
  create((set) => ({

    // ===== STATE =====
    tenantId: null,
    user: null,

    menu: [],
    orderItems: [],

    selectedTable: "T1",

    category: "starter",

    search: "",

    tableStatus: {
      T1: "AVAILABLE",
      T2: "ACTIVE",
      T3: "BILLING",
      T4: "AVAILABLE",
      T5: "WAITING",
      T6: "CLEANING",
    },

    tableSessions: {
      T1: null,

      T2: {
        startedAt: Date.now(),
        guests: 2,
        orders: 3,
        revenue: 0,
      },

      T3: {
        startedAt: Date.now(),
        guests: 4,
        orders: 5,
        revenue: 0,
      },

      T4: null,

      T5: {
        startedAt: Date.now(),
        guests: 1,
        orders: 1,
        revenue: 0,
      },

      T6: null,
    },

    sending: false,

    // ===== SETTERS =====
    setTenantId: (
      tenantId
    ) =>
      set({
        tenantId,
      }),

    setUser: (user) =>
      set({
        user,
      }),

    setMenu: (menu) =>
      set({
        menu,
      }),

    setCategory: (
      category
    ) =>
      set({
        category,
      }),

    setSearch: (
      search
    ) =>
      set({
        search,
      }),

    setSelectedTable: (
      selectedTable
    ) =>
      set({
        selectedTable,
      }),

    setTableStatus: (
      tableStatus
    ) =>
      set({
        tableStatus,
      }),

    setTableSessions: (
      tableSessions
    ) =>
      set({
        tableSessions,
      }),

    setSending: (
      sending
    ) =>
      set({
        sending,
      }),

    setOrderItems: (
      orderItems
    ) =>
      set({
        orderItems,
      }),

  }));
