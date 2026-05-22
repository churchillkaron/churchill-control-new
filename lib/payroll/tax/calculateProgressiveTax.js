export default function calculateProgressiveTax({

  taxableIncome = 0,

  taxBrackets = [],

}) {

  let remainingIncome =
    Number(taxableIncome || 0);

  let totalTax = 0;

  const sortedBrackets =
    [...taxBrackets].sort(
      (a, b) =>
        a.threshold - b.threshold
    );

  for (
    let i = 0;
    i < sortedBrackets.length;
    i++
  ) {

    const current =
      sortedBrackets[i];

    const next =
      sortedBrackets[i + 1];

    const currentThreshold =
      Number(
        current.threshold || 0
      );

    const nextThreshold =
      next
        ? Number(
            next.threshold
          )
        : Infinity;

    if (
      taxableIncome <=
      currentThreshold
    ) {
      continue;
    }

    const taxableAtBracket =
      Math.min(
        remainingIncome,
        nextThreshold -
        currentThreshold
      );

    if (
      taxableAtBracket <= 0
    ) {
      continue;
    }

    totalTax +=
      taxableAtBracket *
      (
        Number(
          current.rate || 0
        ) / 100
      );

    remainingIncome -=
      taxableAtBracket;

    if (
      remainingIncome <= 0
    ) {
      break;
    }

  }

  return Number(
    totalTax.toFixed(2)
  );

}
