export function calculateBill(
  order,
  options = {}
) {

  const taxRate =
    options.taxRate || 0.07;

  const serviceRate =
    options.serviceRate || 0.05;

  const discount =
    options.discount || 0;

  const items =
    order.order_items || [];

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
    );

  const discountAmount =
    subtotal *
    discount;

  const afterDiscount =
    subtotal -
    discountAmount;

  const serviceAmount =
    afterDiscount *
    serviceRate;

  const taxAmount =
    (
      afterDiscount +
      serviceAmount
    ) * taxRate;

  const total =
    afterDiscount +
    serviceAmount +
    taxAmount;

  return {

    subtotal,

    discountAmount,

    serviceAmount,

    taxAmount,

    total,

  };

}
