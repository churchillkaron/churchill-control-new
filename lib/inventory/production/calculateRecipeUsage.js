export function calculateRecipeUsage(
  recipeItems,
  quantity
) {

  return recipeItems.map(
    item => ({

      item_id:
        item.item_id,

      ingredient_name:
        item.ingredient_name,

      usage_quantity:

        Number(
          item.quantity || 0
        ) *

        Number(
          quantity || 0
        ),

      unit:
        item.unit,

      cost:

        Number(
          item.cost || 0
        ) *

        Number(
          quantity || 0
        ),

    })
  );

}
