export function buildCashflowSummary({
  payments = [],
  payables = [],
}) {

  const incoming =
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

  const outgoing =
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

  const pendingPayables =
    payables
      .filter(
        payable =>
          payable.status !==
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

  return {

    incoming:
      Number(
        incoming.toFixed(2)
      ),

    outgoing:
      Number(
        outgoing.toFixed(2)
      ),

    net_cashflow:
      Number(
        (
          incoming -
          outgoing
        ).toFixed(2)
      ),

    pending_payables:
      Number(
        pendingPayables.toFixed(2)
      ),
  }
}
