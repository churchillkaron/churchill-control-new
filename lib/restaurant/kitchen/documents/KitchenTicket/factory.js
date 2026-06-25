import { randomUUID } from "crypto";

export function createKitchenTicketDocument({
  organizationId,
  orderId,
  sessionId,
  tableId,
  tableNumber,
  station = "KITCHEN",
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

    station,

    status: "NEW",

    items,

    startedAt: null,
    readyAt: null,
    completedAt: null,

    createdAt: now,
    updatedAt: now,
  };
}
