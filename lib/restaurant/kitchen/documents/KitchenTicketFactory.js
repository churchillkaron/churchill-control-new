import { randomUUID } from "crypto";

export function createKitchenTicketDocument({
  organizationId,
  orderId,
  sessionId,
  tableId,
  tableNumber,
  workCenterId,
  items = [],
}) {
  const now = new Date().toISOString();

  return {
    id: randomUUID(),

    organizationId,

    orderId,
    sessionId,

    tableId,
    tableNumber,

    workCenterId,

    status: "NEW",

    items,

    startedAt: null,
    readyAt: null,
    completedAt: null,

    createdAt: now,
    updatedAt: now,
  };
}
