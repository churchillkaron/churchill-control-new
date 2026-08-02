import updateKitchenTicketItemStatus from "@/lib/restaurant/operations/updateKitchenTicketItemStatus";

export default async function updateWorkCenterItemStatus(body = {}) {
  return updateKitchenTicketItemStatus({
    organizationId: body.organizationId || body.organization_id,
    ticketId: body.ticketId || body.ticket_id || null,
    itemId: body.itemId || body.item_id,
    status: body.status || body.transition,
  });
}
