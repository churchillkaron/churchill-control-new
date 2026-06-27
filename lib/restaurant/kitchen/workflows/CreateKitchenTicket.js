import {
  createKitchenTicketDocument,
} from "@/lib/restaurant/kitchen/documents/KitchenTicketFactory";

import {
  createKitchenTicket,
} from "@/lib/restaurant/repositories/kitchen/KitchenTicketRepository";

export async function execute({
  context,
  payload,
}) {

  const ticket =
    createKitchenTicketDocument({

      organizationId:
        context.organizationId,

      orderId:
        payload.orderId,

      sessionId:
        payload.sessionId,

      tableId:
        payload.tableId,

      tableNumber:
        payload.tableNumber,

      items:
        payload.items || [],

    });

  return await createKitchenTicket({
    document: ticket,
  });

}
