export default function applyModifiers({
  basePrice = 0,
  modifiers = [],
}) {

  const modifierTotal =
    modifiers.reduce(
      (
        sum,
        modifier
      ) => {

        return (
          sum +
          Number(
            modifier.price || 0
          )
        );
      },
      0
    );

  return Number(
    (
      Number(basePrice) +
      modifierTotal
    ).toFixed(2)
  );
}
