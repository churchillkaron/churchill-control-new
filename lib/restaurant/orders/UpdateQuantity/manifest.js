import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { registerCapability } from "@/lib/ubte/runtime/metadata/CapabilityMetadata";

export default registerCapability(
  defineCapability({
    domain: "restaurant",
    capability: "orders",
    action: "UpdateQuantity",
    description: "Update item quantity on a RestaurantOrder aggregate.",
    permissions: [
      "restaurant.orders.item.quantity"
    ],
    events: [
      "restaurant.order.item.quantity_updated",
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
