export function distributeServiceCharge({
  total = 0,
}) {

  const foh =
    Number(total) * 0.5

  const bar =
    Number(total) * 0.3

  const kitchen =
    Number(total) * 0.2

  return {
    FOH:
      Number(
        foh.toFixed(2)
      ),

    BAR:
      Number(
        bar.toFixed(2)
      ),

    KITCHEN:
      Number(
        kitchen.toFixed(2)
      ),
  }
}
