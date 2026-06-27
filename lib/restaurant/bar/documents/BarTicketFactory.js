import {
  getDefaultWorkCenter,
} from "@/lib/restaurant/settings/WorkCenterRepository";

import { randomUUID } from "crypto";

export function createBarTicketDocument({
  organizationId,
  orderId,
  sessionId,
  tableId,
  tableNumber,
  items = [],
}) {

  const now =
    new Date().toISOString();

  return {

    id:
      randomUUID(),

    organizationId,

    orderId,

    sessionId,

    tableId,

    tableNumber,

    workCenterId:
      null,

    // station resolved from work center
    station:
      null,

    status:
      "NEW",

    items,

    startedAt:
      null,

    readyAt:
      null,

    completedAt:
      null,

    createdAt:
      now,

    updatedAt:
      now,

  };

}
