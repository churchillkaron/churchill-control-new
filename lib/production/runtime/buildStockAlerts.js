export function buildStockAlerts(
  ingredients = []
) {

  const alerts = []

  ingredients.forEach(
    ingredient => {

      const stock =
        Number(
          ingredient.stock || 0
        )

      const minimum =
        Number(
          ingredient.minimum_stock || 0
        )

      if (
        stock <= 0
      ) {

        alerts.push({
          type:
            'OUT_OF_STOCK',

          severity:
            'CRITICAL',

          ingredient_id:
            ingredient.id,

          ingredient:
            ingredient.name,

          stock,
        })

      } else if (
        stock <= minimum
      ) {

        alerts.push({
          type:
            'LOW_STOCK',

          severity:
            'HIGH',

          ingredient_id:
            ingredient.id,

          ingredient:
            ingredient.name,

          stock,

          minimum,
        })
      }
    }
  )

  return alerts
}
