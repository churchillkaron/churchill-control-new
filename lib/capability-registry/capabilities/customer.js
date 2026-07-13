export const CUSTOMER_CAPABILITIES = {

  customer: {
    id: "customer",
    name: "Customer",

    actions: [
      "create",
      "edit",
      "archive",
      "history",
      "documents",
      "create_invoice",
      "create_payment",
      "create_order"
    ],

    permissions: [
      "customer.view",
      "customer.create",
      "customer.update"
    ]
  }

};
