export function buildProfitLossSummary({
  payments = [],
  refunds = [],
  production_costs = [],
  waste_logs = [],
  payables = [],
}) {

  const revenue =
    payments.reduce(
      (
        sum,
        payment
      ) =>
        sum +
        Number(
          payment.total || 0
        ),
      0
    )

  const refundsTotal =
    refunds.reduce(
      (
        sum,
        refund
      ) =>
        sum +
        Number(
          refund.amount || 0
        ),
      0
    )

  const cogs =
    production_costs.reduce(
      (
        sum,
        item
      ) =>
        sum +
        Number(
          item.total_cost || 0
        ),
      0
    )

  const waste =
    waste_logs.reduce(
      (
        sum,
        item
      ) =>
        sum +
        Number(
          item.estimated_cost || 0
        ),
      0
    )

  const operatingExpenses =
    payables
      .filter(
        payable =>
          payable.status ===
          'PAID'
      )
      .reduce(
        (
          sum,
          payable
        ) =>
          sum +
          Number(
            payable.amount || 0
          ),
        0
      )

  const netRevenue =
    revenue -
    refundsTotal

  const grossProfit =
    netRevenue -
    cogs

  const netProfit =
    grossProfit -
    waste -
    operatingExpenses

  return {

    revenue:
      Number(
        revenue.toFixed(2)
      ),

    refunds:
      Number(
        refundsTotal.toFixed(2)
      ),

    net_revenue:
      Number(
        netRevenue.toFixed(2)
      ),

    cogs:
      Number(
        cogs.toFixed(2)
      ),

    waste:
      Number(
        waste.toFixed(2)
      ),

    operating_expenses:
      Number(
        operatingExpenses.toFixed(2)
      ),

    gross_profit:
      Number(
        grossProfit.toFixed(2)
      ),

    net_profit:
      Number(
        netProfit.toFixed(2)
      ),
  }
}
