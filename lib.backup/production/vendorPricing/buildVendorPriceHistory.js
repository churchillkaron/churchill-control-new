export function buildVendorPriceHistory({
  purchase_items = [],
}) {

  const history = {}

  purchase_items.forEach(
    item => {

      const ingredient =
        item.ingredient_id

      if (
        !history[
          ingredient
        ]
      ) {

        history[
          ingredient
        ] = {
          ingredient_id:
            ingredient,

          prices: [],
        }
      }

      history[
        ingredient
      ].prices.push({
        unit_price:
          Number(
            item.unit_price || 0
          ),

        created_at:
          item.created_at,
      })
    }
  )

  return Object.values(
    history
  ).map(
    ingredient => {

      const prices =
        ingredient.prices.map(
          p =>
            p.unit_price
        )

      const average =
        prices.length > 0
          ? prices.reduce(
              (
                a,
                b
              ) => a + b,
              0
            ) / prices.length
          : 0

      const latest =
        prices[
          prices.length - 1
        ] || 0

      return {

        ingredient_id:
          ingredient.ingredient_id,

        average_price:
          Number(
            average.toFixed(2)
          ),

        latest_price:
          Number(
            latest.toFixed(2)
          ),

        total_records:
          prices.length,

        history:
          ingredient.prices,
      }
    }
  )
}
