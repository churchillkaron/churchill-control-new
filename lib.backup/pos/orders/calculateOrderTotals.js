export default function calculateOrderTotals({
  items = [],
  discount = 0,
  taxRate = 7,
  serviceChargeRate = 0,
}) {

  const subtotal =
    items.reduce(
      (
        sum,
        item
      ) => {

        const quantity =
          Number(
            item.quantity || 0
          );

        const price =
          Number(
            item.price || 0
          );

        return (
          sum +
          quantity * price
        );
      },
      0
    );

  const discountAmount =
    Number(discount || 0);

  const afterDiscount =
    subtotal -
    discountAmount;

  const tax =
    afterDiscount *
    (
      taxRate / 100
    );

  const serviceCharge =
    afterDiscount *
    (
      serviceChargeRate / 100
    );

  const total =
    afterDiscount +
    tax +
    serviceCharge;

  return {

    subtotal:
      Number(
        subtotal.toFixed(2)
      ),

    discount:
      Number(
        discountAmount.toFixed(2)
      ),

    tax:
      Number(
        tax.toFixed(2)
      ),

    service_charge:
      Number(
        serviceCharge.toFixed(2)
      ),

    total:
      Number(
        total.toFixed(2)
      ),
  };
}
