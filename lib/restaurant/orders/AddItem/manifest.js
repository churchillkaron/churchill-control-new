import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { registerCapability } from "@/lib/ubte/runtime/metadata/CapabilityMetadata";

export default registerCapability(
  defineCapability({
    domain: "restaurant",
    capability: "orders",
    action: "AddItem",
    description: "Add an item to a RestaurantOrder document.",
    permissions: [
      "restaurant.orders.item.add"
    ],
    events: [
      "restaurant.order.item.added",
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
