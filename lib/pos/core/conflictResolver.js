
/**
 * CONFLICT RESOLUTION ENGINE
 * Determines which event wins when conflicts occur
 */

export function resolveConflict(currentState, incomingEvent) {

  // RULE 1: higher version always wins
  if (incomingEvent.version < currentState.version) {
    return currentState;
  }

  // RULE 2: same version → latest timestamp wins
  if (incomingEvent.version === currentState.version) {
    return incomingEvent.timestamp > currentState.timestamp
      ? incomingEvent
      : currentState;
  }

  // RULE 3: default accept
  return incomingEvent;
}

