export function validatePayment({
  total = 0,
  paidAmount = 0,
}) {

  if (
    Number(paidAmount) <
    Number(total)
  ) {

    return {
      valid: false,
      message:
        'INSUFFICIENT_PAYMENT',
    }
  }

  return {
    valid: true,
    change:
      Number(paidAmount) -
      Number(total),
  }
}
