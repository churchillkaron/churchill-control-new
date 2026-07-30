import {
  createKitchenTicketDocument,
} from "@/lib/restaurant/kitchen/documents/KitchenTicketFactory";

import {
  createKitchenTicket,
} from "@/lib/restaurant/repositories/kitchen/KitchenTicketRepository";

import {
  getDefaultWorkCenter,
  getWorkCenter,
} from "@/lib/restaurant/settings/WorkCenterRepository";

export async function execute({
  context,
  payload,
}) {
  const organizationId = context?.organizationId;

  if (!organizationId) {
    throw new Error("organizationId required");
  }

  const workCenter = payload.workCenterId
    ? await getWorkCenter(organizationId, payload.workCenterId)
    : await getDefaultWorkCenter(organizationId);

  const ticket = createKitchenTicketDocument({
    organizationId,
    orderId: payload.orderId,
    sessionId: payload.sessionId,
    tableId: payload.tableId,
    tableNumber: payload.tableNumber,
    workCenterId: workCenter.id,
    items: payload.items || [],
  });

  ticket.station =
    workCenter.station ||
    workCenter.code ||
    workCenter.name ||
    null;

  return createKitchenTicket({
    document: ticket,
  });
}
