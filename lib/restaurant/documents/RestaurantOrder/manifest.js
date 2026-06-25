import { defineDocument } from "@/lib/ubte/documents/defineDocument";

export const RestaurantOrderDocument =
  defineDocument({

    type:
      "restaurant.order",

    domain:
      "restaurant",

    name:
      "Restaurant Order",

    lifecycle: [
      "DRAFT",
      "OPEN",
      "SENT_TO_KITCHEN",
      "IN_PREPARATION",
      "READY",
      "SERVED",
      "PAYMENT_PENDING",
      "PAID",
      "CLOSED",
      "ARCHIVED",
      "VOIDED",
      "CANCELLED",
    ],

    defaultStatus:
      "DRAFT",

    schema: {},

    events: {
      created:
        "restaurant.order.created",
    },

    relationships: {
      session:
        "TableSession",

      customer:
        "Customer",

      payments:
        "Payment",
    },

  });
