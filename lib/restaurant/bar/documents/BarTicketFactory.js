import { randomUUID } from "crypto";

export function createBarTicketDocument({
  organizationId,
  orderId,
  sessionId,
  tableId,
  tableNumber,
  workCenterId,
  station = null,
  items = [],
}) {
  const now = new Date().toISOString();

  if (!organizationId) {
    throw new Error("Bar ticket organizationId required");
  }

  if (!workCenterId) {
    throw new Error("Bar ticket workCenterId required");
  }

  return {
    id: randomUUID(),
    organizationId,
    orderId,
    sessionId,
    tableId,
    tableNumber,
    workCenterId,
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
