export const RestaurantOrderContract = {
  document: "RestaurantOrder",
  aggregate: "RestaurantOrderAggregate",
  repository: "RestaurantOrderRepository",
  applicationService: "RestaurantOrderApplicationService",
  capabilities: ["CancelOrder"],
  events: [
    "restaurant.order.created",
    "restaurant.order.updated",
    "restaurant.order.cancelled",
  ],
};
