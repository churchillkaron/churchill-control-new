export default function buildReceipt({
  order,
  items = [],
  payment = null,
}) {

  return {

    receipt_number:
      `RCPT-${order.order_number}`,

    order_number:
      order.order_number,

    customer_name:
      order.customer_name,

    table_number:
      order.table_number,

    items:
      items.map(
        (item) => ({

          item_name:
            item.item_name,

          quantity:
            item.quantity,

          price:
            item.price,

          total:
            Number(
              (
                Number(
                  item.quantity
                ) *
                Number(
                  item.price
                )
              ).toFixed(2)
            ),
        })
      ),

    subtotal:
      order.subtotal,

    discount:
      order.discount,

    tax:
      order.tax,

    service_charge:
      order.service_charge,

    total:
      order.total,

    payment,

    generated_at:
      new Date().toISOString(),
  };
}
