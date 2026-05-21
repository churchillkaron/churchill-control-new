export function calculateYieldAnalysis({
  batches = [],
}) {

  return batches.map(
    batch => {

      const produced =
        Number(
          batch.produced_quantity || 0
        )

      const expected =
        Number(
          batch.expected_quantity || 0
        )

      const waste =
        expected - produced

      const yieldPercent =
        expected > 0
          ? (
              produced /
              expected
            ) * 100
          : 0

      return {

        batch_id:
          batch.id,

        ingredient_id:
          batch.ingredient_id,

        expected_quantity:
          expected,

        produced_quantity:
          produced,

        waste:
          Number(
            waste.toFixed(2)
          ),

        yield_percent:
          Number(
            yieldPercent.toFixed(2)
          ),
      }
    }
  )
}
