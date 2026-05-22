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

  const serviceCharge =
    Number(
      (
        subtotal * 0.05
      ).toFixed(2)
    )

  const tax =
    Number(
      (
        (
          subtotal +
          serviceCharge
        ) * 0.07
      ).toFixed(2)
    )

  const total =
    Number(
      (
        subtotal +
        serviceCharge +
        tax
      ).toFixed(2)
    )

  const paid =
    payments.reduce(
      (
        sum,
        payment
      ) =>

        sum +

        Number(

          payment.amount ||

          payment.amount_paid ||

          0
        ),

      0
    )

  const remainingBalance =
    Math.max(
      0,
      total - paid
    )

  const change =
    Math.max(
      0,
      paid - total
    )

  return {

    order_id:
      order.id,

    receipt_number:
      order.receipt_number ||

      `RCPT-${Date.now()}`,

    table,

    guests,

    cashier,

    created_at:
      new Date()
        .toISOString(),

    items:
      items.map(
        item => ({

          item_name:

            item.item_name ||

            item.name,

          quantity:
            item.quantity,

          price:
            item.price,

          status:
            item.status,

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

    service_charge:
      serviceCharge,

    tax:
      tax,

    total:
      total,

    paid:
      Number(
        paid.toFixed(2)
      ),

    remaining_balance:
      Number(
        remainingBalance.toFixed(2)
      ),

    change:
      Number(
        change.toFixed(2)
      ),

    payment_breakdown:

      payments.map(
        payment => ({

          method:

            payment.payment_type ||

            payment.method,

          amount:

            Number(

              payment.amount ||

              payment.amount_paid ||

              0
            ),

        })
      ),

    payments,

  }

}
