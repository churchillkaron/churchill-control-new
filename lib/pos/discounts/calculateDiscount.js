export default function calculateDiscount({
  subtotal = 0,
  discountType = "FIXED",
  discountValue = 0,
}) {

  const subtotalValue =
    Number(subtotal || 0);

  const value =
    Number(discountValue || 0);

  if (
    discountType ===
    "PERCENTAGE"
  ) {

    return Number(
      (
        subtotalValue *
        (
          value / 100
        )
      ).toFixed(2)
    );
  }

  return Number(
    value.toFixed(2)
  );
}
