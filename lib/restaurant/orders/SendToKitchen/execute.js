import {
  loadAggregate,
  saveAggregate,
} from "@/lib/restaurant/repositories/orders/RestaurantOrderAggregateRepository";

import {
  execute as createKitchenTicket,
} from "@/lib/restaurant/kitchen/workflows/CreateKitchenTicket";

export async function execute({

  context,

  payload,

}) {

  const aggregate =
    await loadAggregate({

      organizationId:
        context.organizationId,

      orderId:
        payload.orderId,

    });

  const result =
    aggregate.sendToKitchen();

  const tickets = [];

  for (
    const workCenter of
    Object.values(
      result.workCenters
    )
  ) {

    const ticket =
      await createKitchenTicket({

        context,

        payload: {

          organizationId:
            context.organizationId,

          orderId:
            aggregate.state.id,

          sessionId:
            aggregate.state.sessionId,

          tableId:
            aggregate.state.tableId,

          tableNumber:
            aggregate.state.tableNumber,

          workCenterId:
            workCenter.id,

          items:
            workCenter.items,

        },

      });

    tickets.push(ticket);

  }

  await saveAggregate({

    aggregate,

  });

  return {

    order:
      aggregate.state,

    tickets,

  };

}
