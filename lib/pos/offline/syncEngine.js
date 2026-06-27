import { getQueue, removeFromQueue } from "./orderQueue";

/**
 * SYNC OFFLINE ORDERS WHEN ONLINE
 */
export async function syncOfflineOrders(organizationId) {

  const queue = getQueue();

  if (!queue.length) return;

  for (const order of queue) {

    try {

      const res = await fetch("/api/pos/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          organizationId,
          ...order
        })
      });

      const json = await res.json();

      if (json.success) {
        removeFromQueue(order.id);
      }

    } catch (err) {
      console.error("SYNC FAILED:", err);
    }

  }
}
