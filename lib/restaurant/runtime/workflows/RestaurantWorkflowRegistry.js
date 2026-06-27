export const RESTAURANT_WORKFLOWS = {

  CreateRestaurantOrder:
    () =>
      import(
        "@/lib/restaurant/orders/workflows/CreateRestaurantOrderWorkflow"
      ),

  SendOrderToKitchen:
    () =>
      import(
        "@/lib/restaurant/orders/workflows/SendOrderToKitchenWorkflow"
      ),

  CompleteKitchen:
    () =>
      import(
        "@/lib/restaurant/orders/workflows/CompleteKitchenWorkflow"
      ),

  CreatePayment:
    () =>
      import(
        "@/lib/restaurant/payments/workflows/CreatePaymentWorkflow"
      ),

  CompletePayment:
    () =>
      import(
        "@/lib/restaurant/payments/workflows/CompletePaymentWorkflow"
      ),

};
