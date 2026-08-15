import transitionRestaurantFulfillmentItem from "./transitionRestaurantFulfillmentItem";

export async function updateKitchenTicketItemStatus({
  itemId,
  organizationId,
  entityId,
  status,
  ticketId = null,
  actorId = null,
}) {
  return transitionRestaurantFulfillmentItem({
    sourceKind: "kitchen",
    itemId,
    organizationId,
    entityId,
    status,
    ticketId,
    actorId,
  });
}

export default updateKitchenTicketItemStatus;
