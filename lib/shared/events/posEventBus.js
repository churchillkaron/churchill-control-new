/**
 * SIMPLE POS EVENT BUS (SERVER-SIDE)
 * Used to synchronize POS state across modules
 */

const listeners = {};

export function emit(event, payload) {
  if (!listeners[event]) return;

  for (const cb of listeners[event]) {
    try {
      cb(payload);
    } catch (err) {
      console.error("Event error:", err);
    }
  }
}

export function on(event, callback) {
  if (!listeners[event]) {
    listeners[event] = [];
  }

  listeners[event].push(callback);

  return () => {
    listeners[event] =
      listeners[event].filter(cb => cb !== callback);
  };
}
