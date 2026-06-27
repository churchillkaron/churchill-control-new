export const FinancePaymentContract = {

  document: "FinancePayment",

  aggregate: "FinancePaymentAggregate",

  repository: "FinancePaymentRepository",

  applicationService:
    "FinancePaymentApplicationService",

  capabilities: [

    "CreateFinancePayment",

    "PostFinancePayment",

  ],

  events: [

    "finance.payment.created",

    "finance.payment.posted",

  ],

};
