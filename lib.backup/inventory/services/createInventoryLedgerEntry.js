import { createClient } from '@supabase/supabase-js'

const supabase =
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

export async function createInventoryLedgerEntry({
  tenantId,
  ingredientId,
  orderId,
  movementType,
  quantity,
  unitCost,
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  const totalCost =
    Number(quantity || 0) *
    Number(unitCost || 0)

  const entry = {

    tenant_id:
      tenantId,

    ingredient_id:
      ingredientId,

    reference_type:
      movementType,

    reference_id:
      orderId,

    quantity,

    unit_cost:
      unitCost,

    total_cost:
      totalCost,

    created_at:
      new Date().toISOString(),
  }

  const {
    data,
    error,
  } = await supabase
    .from('inventory_ledger')
    .insert(entry)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}
