import {
  RestaurantOrderAggregate,
} from "@/lib/restaurant/aggregates/RestaurantOrder";

function tableReference(order) {
  const table =
    order.restaurant_table ||
    order.table ||
    null;

  const session =
    order.table_session ||
    order.session ||
    null;

  return (
    table?.table_number ||
    table?.table_name ||
    table?.name ||
    session?.table_number ||
    null
  );
}

function sessionCustomer(order) {
  const session =
    order.table_session ||
    order.session ||
    null;

  return {
    id:
      session?.customer_id ||
      null,
    name:
      session?.customer_name ||
      null,
  };
}

export function fromRepository({
  organizationId,
  order,
}) {
  const customer =
    sessionCustomer(order);

  return new RestaurantOrderAggregate({
    ...order,

    organizationId,

    sessionId:
      order.session_id,

    tableId:
      order.table_id,

    tableNumber:
      tableReference(order),

    customerId:
      customer.id,

    customerName:
      customer.name,

    staffId:
      order.staff_id,

    staffName:
      order.staff_name,

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

          dishId:
            item.dish_id,

          name:
            item.item_name,

          quantity:
            item.quantity,

          price:
            item.price,

          notes:
            item.notes,

          configurationSelections:
            item.transaction_configuration_selections ||
            item.modifiers ||
            [],

          seatPosition:
            item.seat_position,

          status:
            item.status,
        })
      ),
  });
}
