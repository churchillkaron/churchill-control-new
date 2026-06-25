export default {

  workflow:
    "RestaurantService",

  version:
    "1.0.0",

  description:
    "Reference restaurant operational workflow.",

  steps: [

    "OpenSession",

    "CreateRestaurantOrder",

    "AddItem",

    "CreateKitchenTicket",

  ],

};
