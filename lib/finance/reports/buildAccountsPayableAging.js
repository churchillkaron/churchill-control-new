export function buildAccountsPayableAging({
  payables = [],
}) {

  const now =
    Date.now()

  const report = {

    current: 0,

    days_1_30: 0,

    days_31_60: 0,

    days_61_90: 0,

    days_90_plus: 0,

    total_outstanding: 0,
  }

  payables.forEach(
    payable => {

      if (
        payable.status ===
        'PAID'
      ) {
        return
      }

      const dueDate =
        payable.due_date
          ? new Date(
              payable.due_date
            ).getTime()
          : now

      const diffDays =
        Math.floor(
          (
            now - dueDate
          ) /
          1000 /
          60 /
          60 /
          24
        )

      const amount =
        Number(
          payable.amount || 0
        )

      report.total_outstanding +=
        amount

      if (diffDays <= 0) {

        report.current +=
          amount

      } else if (
        diffDays <= 30
      ) {

        report.days_1_30 +=
          amount

      } else if (
        diffDays <= 60
      ) {

        report.days_31_60 +=
          amount

      } else if (
        diffDays <= 90
      ) {

        report.days_61_90 +=
          amount

      } else {

        report.days_90_plus +=
          amount
      }
    }
  )

  return {

    current:
      Number(
        report.current.toFixed(2)
      ),

    days_1_30:
      Number(
        report.days_1_30.toFixed(2)
      ),

    days_31_60:
      Number(
        report.days_31_60.toFixed(2)
      ),

    days_61_90:
      Number(
        report.days_61_90.toFixed(2)
      ),

    days_90_plus:
      Number(
        report.days_90_plus.toFixed(2)
      ),

    total_outstanding:
      Number(
        report.total_outstanding.toFixed(2)
      ),
  }
}
