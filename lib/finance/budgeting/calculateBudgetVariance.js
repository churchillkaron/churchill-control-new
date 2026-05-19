export function calculateBudgetVariance({
  budgets = [],
  actuals = [],
}) {

  return budgets.map(
    budget => {

      const actual =
        actuals.find(
          item =>
            item.category ===
            budget.category
        )

      const budgetAmount =
        Number(
          budget.amount || 0
        )

      const actualAmount =
        Number(
          actual?.amount || 0
        )

      const variance =
        actualAmount -
        budgetAmount

      const variancePercent =
        budgetAmount > 0
          ? (
              variance /
              budgetAmount
            ) * 100
          : 0

      return {

        category:
          budget.category,

        budget:
          Number(
            budgetAmount.toFixed(2)
          ),

        actual:
          Number(
            actualAmount.toFixed(2)
          ),

        variance:
          Number(
            variance.toFixed(2)
          ),

        variance_percent:
          Number(
            variancePercent.toFixed(2)
          ),
      }
    }
  )
}
