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
    "SERVED",
  ],

  SERVED: [
    "CLOSED",
  ],

};

export const ORDER_TRANSITIONS = {

  OPEN: [
    "READY",
    "BILLING",
    "CLOSED",
  ],

  READY: [
    "BILLING",
    "CLOSED",
  ],

  BILLING: [
    "PAID",
  ],

  PAID: [
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

export function canOrderTransition(
  current,
  next
) {

  const allowed =
    ORDER_TRANSITIONS[
      current
    ] || [];

  return allowed.includes(
    next
  );

}
