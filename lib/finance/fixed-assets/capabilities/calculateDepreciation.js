export function calculateDepreciation({
  assets = [],
}) {

  return assets.map(
    asset => {

      const cost =
        Number(
          asset.purchase_cost || 0
        )

      const salvage =
        Number(
          asset.salvage_value || 0
        )

      const usefulLife =
        Number(
          asset.useful_life_years || 1
        )

      const annualDepreciation =
        (
          cost - salvage
        ) / usefulLife

      const monthlyDepreciation =
        annualDepreciation / 12

      return {

        asset_id:
          asset.id,

        asset_name:
          asset.asset_name,

        purchase_cost:
          Number(
            cost.toFixed(2)
          ),

        annual_depreciation:
          Number(
            annualDepreciation.toFixed(2)
          ),

        monthly_depreciation:
          Number(
            monthlyDepreciation.toFixed(2)
          ),
      }
    }
  )
}
