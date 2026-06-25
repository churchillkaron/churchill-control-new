import manifest from "./manifest";
import { validate } from "./validate";
import { authorize } from "./authorize";
import { applyRules } from "./rules";

import {
  RestaurantOrderAggregate,
} from "@/lib/restaurant/aggregates/RestaurantOrder";

import {
  executeAggregateCommand,
} from "@/lib/restaurant/orders/services/RestaurantOrderApplicationService";

import { publish } from "./events";
import { toDTO } from "./dto";

function toAggregate(order, organizationId) {
  return new RestaurantOrderAggregate({
    ...order,
    organizationId,
    sessionId: order.session_id,
    tableId: order.table_id,
    tableNumber: order.table_number,
    customerId: order.customer_id,
    customerName: order.customer_name,
    staffId: order.staff_id,
    staffName: order.staff_name,
    paymentStatus: order.payment_status,
    productionStatus: order.production_status,
    serviceCharge: Number(order.service_charge_amount || 0),
    vat: Number(order.vat_amount || 0),
    discount: Number(order.discount_amount || 0),
    total: Number(order.total || order.total_amount || 0),
    items: (order.order_items || []).map((existing) => ({
      id: existing.id,
      id_from_db: existing.id,
      persisted: true,
      dishId: existing.dish_id,
      name: existing.item_name,
      quantity: existing.quantity,
      price: existing.price,
      notes: existing.notes,
      modifiers: existing.modifiers || {},
      seatPosition: existing.seat_position,
      status: existing.status,
    })),
  });
}

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

      operation:
        async (aggregate) => {
          aggregate.applyDiscount(
            input.discountAmount,
            input.reason
          );
        },
    });

  await publish({
    context,
    order:
      saved,
    discountAmount:
      input.discountAmount,
    reason:
      input.reason,
  });

  return toDTO(saved);
}

export { manifest };
export { validate } from "./validate";
export { authorize } from "./authorize";
export { publish } from "./events";
