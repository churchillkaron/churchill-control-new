import transitionRestaurantFulfillmentItem from "./transitionRestaurantFulfillmentItem";

export async function updateBarTicketItemStatus({
  itemId,
  organizationId,
  entityId,
  status,
  ticketId = null,
  actorId = null,
}) {
  return transitionRestaurantFulfillmentItem({
    sourceKind: "bar",
    itemId,
    organizationId,
    entityId,
    status,
    ticketId,
    actorId,
  });
}

export default updateBarTicketItemStatus;
