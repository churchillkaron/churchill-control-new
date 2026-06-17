import { onPOS, emitPOS } from "@/lib/shared/realtime/posEventBus";

/**
 * UBTE REALTIME CORE
 * Unified system-wide event propagation layer
 */

const subscribers = new Map();

/**
 * SYSTEM SUBSCRIPTION API
 */
export function subscribe(channel, fn) {
  const list = subscribers.get(channel) || [];
  list.push(fn);
  subscribers.set(channel, list);

  return () => {
    const updated = (subscribers.get(channel) || []).filter(f => f !== fn);
    subscribers.set(channel, updated);
  };
}

/**
 * BROADCAST SYSTEM EVENT
 */
export function broadcast(channel, payload) {
  const list = subscribers.get(channel) || [];

  for (const fn of list) {
    try {
      fn(payload);
    } catch (err) {
      console.error("UBTE realtime error:", err);
    }
  }
}

/**
 * AUTO CONNECT UBTE EVENTS → REALTIME CHANNELS
 */
onPOS("*", (event, payload) => {
  broadcast("global", { event, payload });

  if (event.includes("pos")) {
    broadcast("pos", payload);
  }

  if (event.includes("finance")) {
    broadcast("finance", payload);
  }

  if (event.includes("marketing")) {
    broadcast("marketing", payload);
  }
});
