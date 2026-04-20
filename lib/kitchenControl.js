// 🔥 KITCHEN FLOW CONTROL

export function getKitchenQueue() {
  const orders = JSON.parse(localStorage.getItem("orders") || "[]");
  return orders.filter(o => o.status === "kitchen");
}

export function delayNewOrders() {
  localStorage.setItem("kitchen_delay", "true");
}

export function allowOrders() {
  localStorage.setItem("kitchen_delay", "false");
}

export function isKitchenDelayed() {
  return localStorage.getItem("kitchen_delay") === "true";
}

export function reprioritizeOrders() {
  const orders = JSON.parse(localStorage.getItem("orders") || "[]");

  const sorted = orders.sort((a, b) => {
    // oldest first, but prioritize small orders
    const aSize = a.items.length;
    const bSize = b.items.length;

    if (aSize !== bSize) return aSize - bSize;

    return new Date(a.created_at) - new Date(b.created_at);
  });

  localStorage.setItem("orders", JSON.stringify(sorted));
}