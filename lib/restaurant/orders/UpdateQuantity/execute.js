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

  const input =
    await applyRules({
      payload,
    });

  const saved =
    await executeAggregateCommand({
      organizationId:
        context.organizationId,

      orderId:
        input.orderId,

      command:
        async (aggregate) => {
          aggregate.updateQuantity(
            input.itemId,
            input.quantity
          );
        },
    });

  await publish({
    context,
    order:
      saved,
    itemId:
      input.itemId,
    quantity:
      input.quantity,
  });

  return toDTO(saved);
}

export { manifest };
export { validate } from "./validate";
export { authorize } from "./authorize";
export { publish } from "./events";
