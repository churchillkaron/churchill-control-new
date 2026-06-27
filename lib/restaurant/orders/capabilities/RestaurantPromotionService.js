export class RestaurantPromotionService {

  static apply({

    subtotal,

    customer,

    promotions = [],

    order,

  }) {

    const applied = [];

    let discount = 0;

    for (const promotion of promotions) {

      if (!promotion)
        continue;

      if (
        promotion.type === "PERCENT"
      ) {

        const value =
          subtotal *
          (promotion.value / 100);

        discount += value;

        applied.push({
          id: promotion.id,
          amount: value,
        });

      }

      if (
        promotion.type === "FIXED"
      ) {

        const value =
          Number(
            promotion.value || 0
          );

        discount += value;

        applied.push({
          id: promotion.id,
          amount: value,
        });

      }

    }

    return {

      applied,

      discount,

    };

  }

}
