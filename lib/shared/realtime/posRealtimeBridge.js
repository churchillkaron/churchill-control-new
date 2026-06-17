import { onPOS, POS_EVENTS } from "./posEventBus";

/**
 * POS REALTIME BRIDGE (v1)
 * Prepares system for WebSocket / Supabase Realtime upgrade
 */

const subscribers = new Map();

export function subscribePOSRealtime(channel, callback) {
  const list = subscribers.get(channel) || [];
  list.push(callback);
  subscribers.set(channel, list);

  return () => {
    const updated = (subscribers.get(channel) || []).filter(fn => fn !== callback);
    subscribers.set(channel, updated);
  };
}

// internal dispatcher
function broadcast(channel, payload) {
  const list = subscribers.get(channel) || [];
  for (const fn of list) {
    try {
      fn(payload);
    } catch (err) {
      console.error("Realtime bridge error:", err);
    }
  }
}

// connect event bus → realtime channels
onPOS(POS_EVENTS.ORDER_UPDATED, (payload) => {
  broadcast("kitchen", payload);
  broadcast("bar", payload);
  broadcast("waiter", payload);
});

onPOS(POS_EVENTS.ORDER_COMPLETED, (payload) => {
  broadcast("kitchen", payload);
  broadcast("dashboard", payload);
});
