export async function inventoryHandler(
  payload
) {

  console.log(
    'Inventory handler executed',
    payload
  )

  /*
  |--------------------------------------------------------------------------
  | Future Logic
  |--------------------------------------------------------------------------
  |
  | 1. Read recipes
  | 2. Deduct ingredients
  | 3. Create inventory movements
  | 4. Detect low stock
  |
  */

  return {
    module: 'inventory',
    success: true,
  }
}
