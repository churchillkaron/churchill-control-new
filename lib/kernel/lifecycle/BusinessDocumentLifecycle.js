export const DEFAULT_DOCUMENT_LIFECYCLE = [
  "draft",
  "created",
  "validated",
  "submitted",
  "approved",
  "executed",
  "completed",
  "archived",
];

export function createLifecycle({
  id,
  states = DEFAULT_DOCUMENT_LIFECYCLE,
  transitions = [],
}) {
  if (!id) {
    throw new Error("lifecycle id required");
  }

  return {
    id,
    states,
    transitions:
      transitions.length > 0
        ? transitions
        : createDefaultTransitions(states),
  };
}

export function createDefaultTransitions(states = []) {
  return states.slice(0, -1).map((state, index) => ({
    from: state,
    to: states[index + 1],
  }));
}

export function canTransition({
  lifecycle,
  from,
  to,
}) {
  if (!lifecycle) {
    return false;
  }

  return (lifecycle.transitions || []).some(
    transition =>
      transition.from === from &&
      transition.to === to
  );
}
