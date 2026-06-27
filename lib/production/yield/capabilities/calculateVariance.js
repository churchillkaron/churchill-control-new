export function calculateVariance({
  theoretical = [],
  actual = [],
}) {

  const variance = []

  theoretical.forEach(
    theory => {

      const actualItem =
        actual.find(
          item =>
            item.ingredient_id ===
            theory.ingredient_id
        )

      const actualUsage =
        Number(
          actualItem
            ?.actual_usage || 0
        )

      const theoreticalUsage =
        Number(
          theory
            .theoretical_usage || 0
        )

      const difference =
        actualUsage -
        theoreticalUsage

      const variancePercent =
        theoreticalUsage > 0
          ? (
              difference /
              theoreticalUsage
            ) * 100
          : 0

      variance.push({

        ingredient_id:
          theory.ingredient_id,

        ingredient:
          theory.ingredient,

        unit:
          theory.unit,

        theoretical_usage:
          Number(
            theoreticalUsage.toFixed(2)
          ),

        actual_usage:
          Number(
            actualUsage.toFixed(2)
          ),

        variance:
          Number(
            difference.toFixed(2)
          ),

        variance_percent:
          Number(
            variancePercent.toFixed(2)
          ),
      })
    }
  )

  return variance
}
