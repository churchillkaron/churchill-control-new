export function buildPurchaseRecommendations({
  replenishment = [],
  suppliers = [],
}) {

  return replenishment.map(
    item => {

      const supplier =
        suppliers.find(
          supplier =>
            supplier.ingredient_id ===
            item.ingredient_id
        )

      const estimatedCost =
        Number(
          supplier?.price_per_unit || 0
        ) *
        Number(
          item.recommended_order || 0
        )

      return {

        ingredient_id:
          item.ingredient_id,

        ingredient:
          item.ingredient,

        supplier:
          supplier?.supplier_name ||
          'UNASSIGNED',

        recommended_order:
          item.recommended_order,

        unit_price:
          Number(
            supplier?.price_per_unit || 0
          ),

        estimated_cost:
          Number(
            estimatedCost.toFixed(2)
          ),

        urgency:
          item.urgency,
      }
    }
  )
}
