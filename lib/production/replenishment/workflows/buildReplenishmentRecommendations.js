export function buildReplenishmentRecommendations({
  ingredients = [],
  forecast = {},
}) {

  const recommendations = []

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
        stock <= minimum
      ) {

        const recommended =
          (
            minimum * 2
          ) - stock

        recommendations.push({

          ingredient_id:
            ingredient.id,

          ingredient:
            ingredient.name,

          current_stock:
            stock,

          minimum_stock:
            minimum,

          recommended_order:
            Number(
              recommended.toFixed(2)
            ),

          urgency:
            stock <= 0
              ? 'CRITICAL'
              : 'HIGH',
        })
      }
    }
  )

  return {

    projected_rush:
      forecast.projected_rush || 0,

    total_recommendations:
      recommendations.length,

    recommendations,
  }
}
