export function updateWeightedAverageCost(
  currentQty,
  currentCost,
  receivedQty,
  receivedCost
) {

  const existingValue =

    Number(currentQty || 0) *

    Number(currentCost || 0);

  const receivedValue =

    Number(receivedQty || 0) *

    Number(receivedCost || 0);

  const totalQty =

    Number(currentQty || 0) +

    Number(receivedQty || 0);

  if (totalQty <= 0) {

    return 0;

  }

  return (

    existingValue +
    receivedValue

  ) / totalQty;

}
