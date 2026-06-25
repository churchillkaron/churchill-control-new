import {
  refreshOrderReadModel,
  refreshKitchenReadModel,
  refreshPaymentReadModel,
  refreshSessionReadModel,
} from "@/lib/restaurant/read-models";

export async function updateRestaurantProjection({
  event,
  payload,
}) {

  switch(event){

    case "restaurant.order.created":
    case "restaurant.order.updated":
      return refreshOrderReadModel({
        organizationId: payload.organizationId,
        orderId: payload.orderId,
      });

    case "restaurant.kitchen.ticket.created":
    case "restaurant.kitchen.ready":
      return refreshKitchenReadModel({
        organizationId: payload.organizationId,
        ticketId: payload.ticketId,
      });

    case "restaurant.order.paid":
      return refreshPaymentReadModel({
        organizationId: payload.organizationId,
        paymentId: payload.paymentId,
      });

    case "restaurant.session.closed":
      return refreshSessionReadModel({
        organizationId: payload.organizationId,
        sessionId: payload.sessionId,
      });

    default:
      return null;

  }

}
