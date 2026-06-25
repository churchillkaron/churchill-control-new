import manifest from "./manifest";

import { validate } from "./validate";
import { authorize } from "./authorize";
import { applyRules } from "./rules";

import {
  createRestaurantOrderDocument,
  transitionRestaurantOrder,
} from "@/lib/restaurant/documents/RestaurantOrder";

import { RestaurantOrderAggregate } from "@/lib/restaurant/aggregates/RestaurantOrder";
import { saveRestaurantOrder } from "@/lib/restaurant/repositories/orders/RestaurantOrderRepository";

import { publish } from "./events";
import { toDTO } from "./dto";

export async function execute({
  context,
  payload = {},
}) {

  validate({
    context,
    payload,
  });

  await authorize({
    context,
    payload,
  });

  const normalized =
    await applyRules({
      context,
      payload,
    });

  const draft =
    createRestaurantOrderDocument({

      organizationId:
        context.organizationId,

      sessionId:
        normalized.sessionId,

      tableId:
        normalized.tableId,

      tableNumber:
        normalized.tableNumber,

      customerId:
        normalized.customerId,

      customerName:
        normalized.customerName,

      staffId:
        normalized.staffId,

      staffName:
        normalized.staffName,

      items:
        normalized.items,

    });

  const document =
    transitionRestaurantOrder({

      document: draft,

      nextStatus:
        "OPEN",

    });

  const aggregate =
    new RestaurantOrderAggregate(document);

  const saved =
    await saveRestaurantOrder({
      aggregate,
    });

  await publish({

    context,

    document: saved,

  });

  return toDTO(saved);

}

export { manifest };
