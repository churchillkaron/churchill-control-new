import { randomUUID } from "crypto";

export function createKitchenTicketDocument({
  organizationId,
  entityId,
  orderId,
  sessionId,
  tableId,
  tableNumber,
  workCenterId,
  station = null,
  items = [],
}) {
  if (!organizationId) throw new Error("Kitchen ticket organizationId required");
  if (!entityId) throw new Error("Kitchen ticket entityId required");
  if (!workCenterId) throw new Error("Kitchen ticket workCenterId required");

  const now = new Date().toISOString();

  return {
    id: randomUUID(),
    organizationId,
    entityId,
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
