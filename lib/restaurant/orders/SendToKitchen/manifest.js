import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { registerCapability } from "@/lib/ubte/runtime/metadata/CapabilityMetadata";

export default registerCapability(
  defineCapability({
    domain: "restaurant",
    capability: "orders",
    action: "CreateRestaurantOrder",
    description: "Create a RestaurantOrder business document.",
    permissions: [
      "restaurant.orders.create"
    ],
    events: [
      "restaurant.order.created"
    ],
    tags: [
      "restaurant",
      "orders",
      "document"
    ],
    transactional: true,
    auditable: true,
    aiEnabled: false,
  })
);
