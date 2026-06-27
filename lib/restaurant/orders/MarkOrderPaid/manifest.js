import {
  defineCapability,
} from "@/lib/ubte/runtime/contracts/CapabilityManifest";

import {
  registerCapability,
} from "@/lib/ubte/runtime/metadata/CapabilityMetadata";

export default registerCapability(

  defineCapability({

    domain:
      "restaurant",

    capability:
      "orders",

    action:
      "MarkOrderPaid",

    description:
      "Mark a restaurant order as paid.",

    permissions: [

      "restaurant.orders.pay",

    ],

    events: [

      "restaurant.order.paid",

    ],

    tags: [

      "restaurant",
      "orders",
      "payment",

    ],

    transactional: true,
    auditable: true,
    aiEnabled: false,

  })

);
