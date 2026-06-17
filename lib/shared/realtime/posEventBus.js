/**
 * POS EVENT BUS (v1 stable)
 * Safe, deduplicated, production-ready
 */

const listeners = new Map();
const processedEvents = new Set();
let sequence = 0;

export function emitPOS(event, payload = {}) {
  sequence += 1;

  const eventId = payload?.event_id || `${event}-${sequence}`;

  if (processedEvents.has(eventId)) return;
  processedEvents.add(eventId);

  const handlers = listeners.get(event) || [];

  const enrichedPayload = {
    ...payload,
    event_id: eventId,
    sequence_number: sequence,
    timestamp: Date.now(),
  };

  for (const fn of handlers) {
    try {
      fn(enrichedPayload);
    } catch (err) {
      console.error("POS event error:", err);
    }
  }
}

export function onPOS(event, callback) {
  const existing = listeners.get(event) || [];
  existing.push(callback);
  listeners.set(event, existing);

  return () => {
    const updated = (listeners.get(event) || []).filter(fn => fn !== callback);
    listeners.set(event, updated);
  };
}

export const POS_EVENTS = {
  ORDER_UPDATED: "ORDER_UPDATED",
  ORDER_CREATED: "ORDER_CREATED",
  ORDER_COMPLETED: "ORDER_COMPLETED",
  TABLE_UPDATED: "TABLE_UPDATED",
};
