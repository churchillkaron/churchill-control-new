export const ORDER_ITEM_TRANSITIONS = {

  NEW: [
    "COOKING",
    "HOLD",
    "CANCELLED",
  ],

  HOLD: [
    "NEW",
    "CANCELLED",
  ],

  COOKING: [
    "READY",
    "CANCELLED",
  ],

  READY: [
    "RELEASED",
  ],

  RELEASED: [
    "SERVED",
  ],

  SERVED: [
    "CLOSED",
  ],

};

export function canTransition(
  current,
  next
) {

  const allowed =
    ORDER_ITEM_TRANSITIONS[
      current
    ] || [];

  return allowed.includes(
    next
  );

}
