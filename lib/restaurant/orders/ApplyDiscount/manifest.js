import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { registerCapability } from "@/lib/ubte/runtime/metadata/CapabilityMetadata";

export default registerCapability(
  defineCapability({
    domain: "restaurant",
    capability: "orders",
    action: "ApplyDiscount",
    description: "Apply discount to a RestaurantOrder aggregate.",
    permissions: [
      "restaurant.orders.discount.apply"
    ],
    events: [
      "restaurant.order.discount.applied",
      "restaurant.order.recalculated"
    ],
    tags: [
      "restaurant",
      "orders",
      "discount"
    ],
    transactional: true,
    auditable: true,
    aiEnabled: false,
  })
);
