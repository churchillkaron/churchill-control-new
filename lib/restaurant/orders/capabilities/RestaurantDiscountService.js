export class RestaurantDiscountService {

  static calculate({

    subtotal,

    discounts = [],

  }) {

    let total = 0;

    for (const discount of discounts) {

      if (!discount)
        continue;

      if (discount.type === "PERCENT") {

        total +=
          subtotal *
          (discount.value / 100);

      } else if (
        discount.type === "FIXED"
      ) {

        total +=
          Number(
            discount.value || 0
          );

      }

    }

    return Math.min(
      total,
      subtotal
    );

  }

}
