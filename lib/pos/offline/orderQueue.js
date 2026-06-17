/**
 * OFFLINE POS QUEUE
 * Guarantees no order loss even if WiFi drops
 */

const STORAGE_KEY = "POS_OFFLINE_QUEUE";

/**
 * Get queue from localStorage
 */
export function getQueue() {
  if (typeof window === "undefined") return [];
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
}

/**
 * Add order to offline queue
 */
export function enqueueOrder(order) {
  const queue = getQueue();
  queue.push({
    ...order,
    status: "PENDING_SYNC",
    createdAt: new Date().toISOString()
  });

  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

/**
 * Remove synced order
 */
export function removeFromQueue(orderId) {
  const queue = getQueue().filter(o => o.id !== orderId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
}

/**
 * Clear queue
 */
export function clearQueue() {
  localStorage.removeItem(STORAGE_KEY);
}
