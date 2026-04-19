export function calculateAccountingOverview(history = []) {
  // 🔥 load expenses globally
  let expenses = []
  if (typeof window !== "undefined") {
    try {
      expenses = JSON.parse(localStorage.getItem("expenses") || "[]")
    } catch {
      expenses = []
    }
  }

  const totalRevenue = history.reduce(
    (sum, d) => sum + (d.revenue || 0),
    0
  )

  const totalService = history.reduce(
    (sum, d) => sum + (d.serviceCharge || 0),
    0
  )

  const totalPayouts = history.reduce((sum, d) => {
    if (!d.payouts) return sum

    if (typeof d.payouts.total === "number") {
      return sum + d.payouts.total
    }

    return (
      sum +
      Object.values(d.payouts).reduce(
        (a, b) => a + (typeof b === "number" ? b : 0),
        0
      )
    )
  }, 0)

  const totalExpenses = expenses.reduce(
    (sum, e) => sum + (e.amount || 0),
    0
  )

  const netProfit =
    totalRevenue - totalPayouts - totalExpenses

  return {
    revenue: totalRevenue,
    service: totalService,
    payouts: totalPayouts,
    expenses: totalExpenses,
    profit: netProfit,
    days: history.length
  }
}