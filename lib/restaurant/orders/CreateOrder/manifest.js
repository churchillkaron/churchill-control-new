import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { registerCapability } from "@/lib/ubte/runtime/metadata/CapabilityMetadata";

export default registerCapability(
  defineCapability({
    domain: "restaurant",
    capability: "orders",
    action: "CreateOrder",

    description:
      "Create a new restaurant order.",

    permissions: [
      "restaurant.orders.create",
    ],

    events: [
      "restaurant.order.created",
    ],

    tags: [
      "restaurant",
      "orders",
    ],

    transactional: true,
    auditable: true,
    aiEnabled: false,
  })
);
