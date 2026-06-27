import {
  DocumentTypeRegistry,
} from "../registry/DocumentTypeRegistry";

import {
  createLifecycle,
} from "../lifecycle/BusinessDocumentLifecycle";

DocumentTypeRegistry.register({

  id: "RestaurantOrder",

  domain: "restaurant",

  context: "orders",

  lifecycle: createLifecycle({
    id: "restaurant-order",
  }),

});
