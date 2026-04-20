// 🔥 GLOBAL STORE (persists across requests in dev)

if (!global.ordersStore) {
  global.ordersStore = [];
}

export const orders = global.ordersStore;