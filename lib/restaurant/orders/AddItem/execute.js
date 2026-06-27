import manifest from "./manifest";
import { validate } from "./validate";
import { authorize } from "./authorize";
import { applyRules } from "./rules";

import {
  executeAggregateCommand,
} from "@/lib/restaurant/orders/runtime/RestaurantOrderApplicationService";

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

  const item =
    await applyRules({
      payload,
    });

  const saved =
    await executeAggregateCommand({
      organizationId:
        context.organizationId,

      orderId:
        item.orderId,

      operation:
        async (aggregate) => {
          aggregate.addItem(item);
        },
    });

  await publish({
    context,
    order: saved,
    item,
  });

  return toDTO({
    order: saved,
    item,
  });
}

export { manifest };
export { validate } from "./validate";
export { authorize } from "./authorize";
export { publish } from "./events";
