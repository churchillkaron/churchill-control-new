export function splitBill(
  state,
  splitCount = 1
) {
  const safeSplit =
    Math.max(
      1,
      Number(splitCount || 1)
    )

  const remainingBalance =
    Number(
      state?.remainingBalance ||
      state?.financials?.remainingBalance ||
      0
    )

  const perPerson =
    Number(
      (
        remainingBalance /
        safeSplit
      ).toFixed(2)
    )

  return {
    splitCount:
      safeSplit,
    remainingBalance,
    perPerson,
    payments:
      Array.from(
        {
          length:
            safeSplit,
        },
        (_, index) => ({
          seat:
            index + 1,
          total:
            perPerson,
        })
      ),
  }
}
