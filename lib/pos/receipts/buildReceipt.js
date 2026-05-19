export function buildReceipt({
  order = {},
  items = [],
  payments = [],
  cashier = '',
  table = '',
  guests = 1,
}) {

  const subtotal =
    items.reduce(
      (
        sum,
        item
      ) =>
        sum +
        (
          Number(
            item.price || 0
          ) *
          Number(
            item.quantity || 0
          )
        ),
      0
    )

  const tax =
    subtotal * 0.07

  const total =
    subtotal + tax

  const paid =
    payments.reduce(
      (
        sum,
        payment
      ) =>
        sum +
        Number(
          payment.amount || 0
        ),
      0
    )

  const change =
    paid - total

  return {

    order_id:
      order.id,

    receipt_number:
      order.receipt_number,

    table,

    guests,

    cashier,

    created_at:
      new Date()
        .toISOString(),

    items:
      items.map(
        item => ({

          name:
            item.name,

          quantity:
            item.quantity,

          price:
            item.price,

          total:
            Number(
              (
                Number(
                  item.quantity || 0
                ) *
                Number(
                  item.price || 0
                )
              ).toFixed(2)
            ),
        })
      ),

    subtotal:
      Number(
        subtotal.toFixed(2)
      ),

    tax:
      Number(
        tax.toFixed(2)
      ),

    total:
      Number(
        total.toFixed(2)
      ),

    paid:
      Number(
        paid.toFixed(2)
      ),

    change:
      Number(
        change.toFixed(2)
      ),

    payments,
  }
}
