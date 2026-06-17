/**
 * ORDER ITEM STATE MACHINE
 * Single source of truth:
 * order_items.status
 */

const transitions = {

  PENDING: [
    "PREPARING",
    "CANCELLED",
  ],

  PREPARING: [
    "READY",
    "CANCELLED",
  ],

  READY: [
    "SERVED",
  ],

  SERVED: [],

  CANCELLED: [],

};

export function canTransition(
  from,
  to
) {
  return (
    transitions[from] || []
  ).includes(to);
}

export function nextState(
  current,
  requested
) {

  if (
    !canTransition(
      current,
      requested
    )
  ) {

    console.warn(
      `INVALID TRANSITION: ${current} -> ${requested}`
    );

    return current;
  }

  return requested;
}
