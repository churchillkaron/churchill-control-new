export function calculateTaxSummary({
  payments = [],
  payables = [],
  tax_rate = 7,
}) {

  const salesRevenue =
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

  const outputTax =
    salesRevenue *
    (
      Number(tax_rate) / 100
    )

  const purchases =
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

  const inputTax =
    purchases *
    (
      Number(tax_rate) / 100
    )

  const taxPayable =
    outputTax -
    inputTax

  return {

    sales_revenue:
      Number(
        salesRevenue.toFixed(2)
      ),

    purchases:
      Number(
        purchases.toFixed(2)
      ),

    output_tax:
      Number(
        outputTax.toFixed(2)
      ),

    input_tax:
      Number(
        inputTax.toFixed(2)
      ),

    tax_payable:
      Number(
        taxPayable.toFixed(2)
      ),
  }
}
