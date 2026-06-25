import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { registerCapability } from "@/lib/ubte/runtime/metadata/CapabilityMetadata";

export default registerCapability(
  defineCapability({
    domain: "restaurant",
    capability: "session",
    action: "OpenSession",

    description:
      "Open a restaurant session",

    permissions: [
      "restaurant.session.open",
    ],

    events: [
      "restaurant.session.opened",
    ],

    tags: [
      "restaurant",
      "session",
    ],

    transactional: true,
    auditable: true,
    aiEnabled: true,
  })
);
