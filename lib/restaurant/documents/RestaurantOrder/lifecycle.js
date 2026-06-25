import { RestaurantOrderDocument } from "./manifest";

const allowedTransitions = {
  DRAFT: ["OPEN", "CANCELLED"],
  OPEN: ["SENT_TO_KITCHEN", "PAYMENT_PENDING", "CANCELLED", "VOIDED"],
  SENT_TO_KITCHEN: ["IN_PREPARATION", "READY", "VOIDED"],
  IN_PREPARATION: ["READY", "VOIDED"],
  READY: ["SERVED", "VOIDED"],
  SERVED: ["PAYMENT_PENDING", "VOIDED"],
  PAYMENT_PENDING: ["PAID", "VOIDED"],
  PAID: ["CLOSED"],
  CLOSED: ["ARCHIVED"],
  ARCHIVED: [],
  CANCELLED: ["ARCHIVED"],
  VOIDED: ["ARCHIVED"],
};

export function canTransitionRestaurantOrder({
  from,
  to,
}) {
  return Boolean(
    allowedTransitions[from]?.includes(to)
  );
}

export function transitionRestaurantOrder({
  document,
  nextStatus,
}) {
  if (!document?.status) {
    throw new Error("document status required");
  }

  if (!RestaurantOrderDocument.lifecycle.includes(nextStatus)) {
    throw new Error(`Invalid RestaurantOrder status: ${nextStatus}`);
  }

  if (
    !canTransitionRestaurantOrder({
      from: document.status,
      to: nextStatus,
    })
  ) {
    throw new Error(
      `Invalid RestaurantOrder transition: ${document.status} -> ${nextStatus}`
    );
  }

  return {
    ...document,
    status: nextStatus,
    updatedAt: new Date().toISOString(),
  };
}
