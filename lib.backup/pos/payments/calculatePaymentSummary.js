export function calculatePaymentSummary({
  subtotal = 0,
  taxPercent = 7,
  serviceChargePercent = 5,
  discount = 0,
}) {

  const tax =
    subtotal *
    (
      taxPercent / 100
    )

  const serviceCharge =
    subtotal *
    (
      serviceChargePercent / 100
    )

  const total =
    subtotal +
    tax +
    serviceCharge -
    discount

  return {
    subtotal,
    tax,
    serviceCharge,
    discount,
    total,
  }
}
