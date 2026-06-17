
/**
 * VERSIONED EVENT SYSTEM
 * Prevents conflicting updates across devices
 */

export function createVersionedEvent(event, context = {}) {

  return {
    ...event,
    version: context.version || 1,
    terminal_id: context.terminal_id || "UNKNOWN",
    timestamp: Date.now()
  };

}

