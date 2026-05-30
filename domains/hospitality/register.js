import { registerDomain } from "@/lib/platform/domains/registry/registerDomain";

registerDomain({
  key: "hospitality",

  systems: [
    "kitchen",
    "kitchen/expo",
    "tables",
    "bar",
    "service",
  ],

  workflows: [
    "order-flow",
    "kitchen-flow",
    "payment-flow",
  ],

  events: [
    "ORDER_CREATED",
    "ORDER_COMPLETED",
    "PAYMENT_COMPLETED",
  ],
});
