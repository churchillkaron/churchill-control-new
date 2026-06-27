import { getServiceSupabase } from '@/lib/shared/supabase/service'

const supabase = getServiceSupabase()

export async function createPurchaseRequest({
  tenantId,
  ingredient,
}) {

  if (!tenantId || !ingredient) {
    throw new Error(
      'tenantId and ingredient required'
    )
  }

  const currentQuantity =
    Number(
      ingredient.quantity || 0
    )

  const reorderLevel =
    Number(
      ingredient.reorder_level ||
      ingredient.min_quantity ||
      5
    )

  const reorderQuantity =
    Math.max(
      reorderLevel * 2,
      10
    )

  const request = {

    tenant_id:
      tenantId,

    ingredient_id:
      ingredient.id,

    request_type:
      'LOW_STOCK_AUTO',

    status:
      'pending',

    quantity:
      reorderQuantity,

    current_quantity:
      currentQuantity,

    reorder_level:
      reorderLevel,

    notes:
      `Auto-generated from inventory automation for ${ingredient.name}`,

    created_at:
      new Date().toISOString(),

  }

  const {
    data,
    error,
  } = await supabase
    .from('purchase_requests')
    .insert(request)
    .select('*')
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data
}
