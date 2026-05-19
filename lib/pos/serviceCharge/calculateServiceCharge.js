export function calculateServiceCharge({
  revenue = 0,
  percent = 5,
}) {

  const total =
    Number(revenue) *
    (
      Number(percent) / 100
    )

  return {
    percent,
    total,
  }
}
