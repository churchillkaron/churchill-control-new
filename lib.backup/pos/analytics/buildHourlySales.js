export function buildHourlySales(
  payments = []
) {

  const hourly = {}

  payments.forEach(
    payment => {

      const hour =
        new Date(
          payment.created_at
        ).getHours()

      if (!hourly[hour]) {
        hourly[hour] = 0
      }

      hourly[hour] +=
        Number(
          payment.total || 0
        )
    }
  )

  return hourly
}
