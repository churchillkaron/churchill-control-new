export function calculateInventoryValue(
  inventoryItems = []
) {

  let totalValue = 0;

  const breakdown =
    inventoryItems.map(
      item => {

        const quantity =
          Number(
            item.quantity || 0
          );

        const avgCost =
          Number(
            item.average_cost || 0
          );

        const total =
          quantity *
          avgCost;

        totalValue += total;

        return {

          ingredient_id:
            item.id,

          ingredient_name:
            item.name,

          quantity,

          average_cost:
            avgCost,

          inventory_value:
            total,

        };

      }
    );

  return {

    totalInventoryValue:
      totalValue,

    breakdown,

  };

}
