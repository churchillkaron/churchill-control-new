export default {
  workflow: "ServiceLifecycle",
  version: "1.0.0",
  description:
    "Restaurant end-to-end operational workflow.",
  stages: [
    "OpenSession",
    "CreateRestaurantOrder",
    "AddItem",
    "CreateKitchenTicket",
    "StartPreparation",
    "MarkReady",
    "CreatePayment",
    "CompletePayment",
    "CloseSession",
  ],
};
