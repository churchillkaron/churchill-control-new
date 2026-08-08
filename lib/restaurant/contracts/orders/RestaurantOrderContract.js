export const RestaurantOrderContract = {

  document: "RestaurantOrder",

  aggregate: "RestaurantOrderAggregate",

  repository: "RestaurantOrderRepository",

  applicationService:
    "RestaurantOrderApplicationService",

  capabilities: [

    "AddItem",

    "RemoveItem",

    "UpdateQuantity",

    "ApplyDiscount",

    "CancelOrder",

  ],

  events: [

    "restaurant.order.created",

    "restaurant.order.updated",

    "restaurant.order.item_added",

    "restaurant.order.item_removed",

    "restaurant.order.quantity_updated",

    "restaurant.order.discount_applied",

    "restaurant.order.cancelled",

  ],

};
