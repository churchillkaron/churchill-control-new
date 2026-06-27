import {
  RestaurantOrderAggregate,
} from "@/lib/restaurant/aggregates/RestaurantOrder";

export function fromRepository({
  organizationId,
  order,
}) {
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

    paymentStatus:
      order.payment_status,

    productionStatus:
      order.production_status,

    serviceCharge:
      Number(
        order.service_charge_amount || 0
      ),

    vat:
      Number(
        order.vat_amount || 0
      ),

    discount:
      Number(
        order.discount_amount || 0
      ),

    total:
      Number(
        order.total ||
        order.total_amount ||
        0
      ),

    items:
      (order.order_items || []).map(
        (item) => ({
          id: item.id,
          id_from_db: item.id,
          persisted: true,

          dishId: item.dish_id,

          name: item.item_name,

          quantity: item.quantity,

          price: item.price,

          notes: item.notes,

          modifiers:
            item.modifiers || {},

          seatPosition:
            item.seat_position,

          status:
            item.status,
        })
      ),
  });
}
