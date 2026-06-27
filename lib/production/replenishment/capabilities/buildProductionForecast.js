export function buildProductionForecast({
  hourly_sales = {},
  current_stock = [],
}) {

  const peakHour =
    Object.entries(
      hourly_sales
    ).sort(
      (
        a,
        b
      ) => b[1] - a[1]
    )[0]

  const projectedRush =
    peakHour
      ? Number(
          peakHour[1]
        ) * 1.25
      : 0

  const lowStockRisk =
    current_stock.filter(
      ingredient =>
        Number(
          ingredient.stock || 0
        ) <= Number(
          ingredient.minimum_stock || 0
        )
    )

  return {

    peak_hour:
      peakHour
        ? peakHour[0]
        : null,

    projected_rush:
      Number(
        projectedRush.toFixed(2)
      ),

    low_stock_risk:
      lowStockRisk.length,

    ingredients_at_risk:
      lowStockRisk.map(
        ingredient => ({
          ingredient:
            ingredient.name,

          stock:
            ingredient.stock,

          minimum:
            ingredient.minimum_stock,
        })
      ),
  }
}
