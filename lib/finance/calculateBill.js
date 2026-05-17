export function calculateBill({

  subtotal = 0,

  serviceChargePercent = 5,

  vatPercent = 7,

  discountAmount = 0,

}) {

  const subtotalNumber =
    Number(subtotal || 0);

  const discount =
    Number(
      discountAmount || 0
    );

  const serviceCharge =
    (
      subtotalNumber *
      (
        Number(
          serviceChargePercent || 0
        ) / 100
      )
    );

  const afterService =
    subtotalNumber +
    serviceCharge;

  const vat =
    (
      afterService *
      (
        Number(
          vatPercent || 0
        ) / 100
      )
    );

  const finalTotal =
    afterService +
    vat -
    discount;

  return {

    subtotal:
      subtotalNumber,

    serviceCharge:
      Number(
        serviceCharge.toFixed(2)
      ),

    vat:
      Number(
        vat.toFixed(2)
      ),

    discount:
      Number(
        discount.toFixed(2)
      ),

    finalTotal:
      Number(
        finalTotal.toFixed(2)
      ),
  };
}
