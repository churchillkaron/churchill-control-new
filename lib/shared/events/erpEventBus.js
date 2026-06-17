/**
 * ERP GLOBAL EVENT BUS
 * Used for cross-module synchronization
 */

const listeners = {};

export function emit(event, payload) {

  if (!listeners[event]) return;

  for (const cb of listeners[event]) {
    try {
      cb(payload);
    } catch (err) {
      console.error("ERP EVENT ERROR:", err);
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
      listeners[event].filter(c => c !== callback);
  };
}
