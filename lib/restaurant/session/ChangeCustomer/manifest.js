import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { registerCapability } from "@/lib/ubte/runtime/metadata/CapabilityMetadata";

export default registerCapability(
  defineCapability({
    domain: "restaurant",
    capability: "session",
    action: "ChangeCustomer",

    description:
      "Change session customer",

    permissions: [
      "restaurant.session.customer.change",
    ],

    events: [
      "restaurant.session.customer.changed",
    ],

    tags: [
      "restaurant",
      "customer",
    ],

    transactional: true,
    auditable: true,
    aiEnabled: false,
  })
);
