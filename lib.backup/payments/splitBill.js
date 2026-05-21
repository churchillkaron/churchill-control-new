import {
  calculateBill,
} from "./calculateBill";

export function splitBill(
  order,
  splitCount = 1,
  options = {}
) {

  const bill =
    calculateBill(
      order,
      options
    );

  const safeSplit =
    Math.max(
      1,
      Number(splitCount || 1)
    );

  const splitSubtotal =
    bill.subtotal /
    safeSplit;

  const splitTax =
    bill.taxAmount /
    safeSplit;

  const splitService =
    bill.serviceAmount /
    safeSplit;

  const splitDiscount =
    bill.discountAmount /
    safeSplit;

  const splitTotal =
    bill.total /
    safeSplit;

  return {

    splitCount:
      safeSplit,

    subtotal:
      splitSubtotal,

    taxAmount:
      splitTax,

    serviceAmount:
      splitService,

    discountAmount:
      splitDiscount,

    total:
      splitTotal,

    payments:
      Array.from(
        {
          length:
            safeSplit,
        },
        (_, index) => ({

          seat:
            index + 1,

          subtotal:
            splitSubtotal,

          taxAmount:
            splitTax,

          serviceAmount:
            splitService,

          discountAmount:
            splitDiscount,

          total:
            splitTotal,

        })
      ),

  };

}
