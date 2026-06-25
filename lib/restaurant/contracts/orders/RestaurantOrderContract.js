export const RestaurantOrderContract = {

  document: "RestaurantOrder",

  aggregate: "RestaurantOrderAggregate",

  repository: "RestaurantOrderRepository",

  applicationService:
    "RestaurantOrderApplicationService",

  capabilities: [

    "CreateRestaurantOrder",

    "AddItem",

    "RemoveItem",

    "UpdateQuantity",

    "ApplyDiscount",

    "CancelOrder",

    "SendToKitchen",

  ],

  events: [

    "restaurant.order.created",

    "restaurant.order.updated",

    "restaurant.order.item_added",

    "restaurant.order.item_removed",

    "restaurant.order.quantity_updated",

    "restaurant.order.discount_applied",

    "restaurant.order.cancelled",

    "restaurant.order.sent_to_kitchen",

  ],

};
