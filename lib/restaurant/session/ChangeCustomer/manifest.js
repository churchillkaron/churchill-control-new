import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { registerCapability } from "@/lib/ubte/runtime/metadata/CapabilityMetadata";

export default registerCapability(
  defineCapability({
    domain: "restaurant",
    capability: "session",
    action: "ChangeCustomer",

    description:
      "Change the customer assigned to an active restaurant session through the governed restaurant session runtime.",

    permissions: [
      "restaurant.session.customer.change",
    ],

    events: [
      "restaurant.session.customer.changed",
    ],

    tags: [
      "restaurant",
      "customer",
      "session",
    ],

    transactional: true,
    audiservice_unit: true,
    aiEnabled: false,
    operatorEnabled: true,
    operatorMode: "write",
    operatorAutoExecute: false,
    operatorRequiresConfirmation: true,
    contextScope: "organization",
    risk: "medium",
  })
);