import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { registerCapability } from "@/lib/ubte/runtime/metadata/CapabilityMetadata";

export default registerCapability(
  defineCapability({
    domain: "restaurant",
    capability: "orders",
    action: "RemoveItem",
    description: "Remove an item from a RestaurantOrder aggregate.",
    permissions: [
      "restaurant.orders.item.remove"
    ],
    events: [
      "restaurant.order.item.removed",
      "restaurant.order.recalculated"
    ],
    tags: [
      "restaurant",
      "orders",
      "items"
    ],
    transactional: true,
    auditable: true,
    aiEnabled: false,
  })
);
