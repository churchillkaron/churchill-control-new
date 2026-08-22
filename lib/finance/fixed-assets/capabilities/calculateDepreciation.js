function money(value) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

export function calculateDepreciation({ assets = [] }) {
  return assets.map(asset => {
    const cost = money(asset.purchase_cost);
    const salvage = Math.max(0, money(asset.salvage_value));
    const usefulLife = Math.max(1, money(asset.useful_life_years));
    const accumulated = Math.max(0, money(asset.accumulated_depreciation));
    const depreciableBase = Math.max(0, cost - salvage);
    const remainingDepreciable = Math.max(0, depreciableBase - accumulated);
    const annualDepreciation = depreciableBase / usefulLife;
    const scheduledMonthlyDepreciation = annualDepreciation / 12;
    const monthlyDepreciation = Math.min(
      remainingDepreciable,
      scheduledMonthlyDepreciation
    );
    const currentBookValue = Math.max(
      salvage,
      money(asset.current_book_value || cost - accumulated)
    );

    return {
      asset_id: asset.id,
      asset_name: asset.asset_name,
      purchase_cost: Number(cost.toFixed(2)),
      salvage_value: Number(salvage.toFixed(2)),
      accumulated_depreciation: Number(accumulated.toFixed(2)),
      current_book_value: Number(currentBookValue.toFixed(2)),
      annual_depreciation: Number(annualDepreciation.toFixed(2)),
      monthly_depreciation: Number(monthlyDepreciation.toFixed(2)),
      remaining_depreciable: Number(remainingDepreciable.toFixed(2)),
      fully_depreciated: remainingDepreciable <= 0,
    };
  });
}
