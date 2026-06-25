export const PaymentContract = {

  document: "Payment",

  aggregate: "PaymentAggregate",

  repository: "PaymentRepository",

  applicationService:
    "PaymentApplicationService",

  capabilities: [

    "CreatePayment",

    "CompletePayment",

  ],

  events: [

    "restaurant.payment.created",

    "restaurant.payment.completed",

  ],

};
