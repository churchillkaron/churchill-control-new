import calculateInventoryValuation from "@/lib/warehouse/valuation/calculateInventoryValuation";

export default async function generateProfitLoss({
  tenant_id,
  revenue = 0,
  expenses = 0,
}) {

  const inventory =
    await calculateInventoryValuation({
      tenant_id,
    });

  const inventoryValue =
    Number(
      inventory.total_valuation || 0
    );

  const profit =
    revenue -
    expenses;

  return {
    success: true,
    revenue,
    expenses,
    inventory_value:
      inventoryValue,
    gross_profit:
      profit,
    generated_at:
      new Date().toISOString(),
  };
}
