import { getServiceSupabase } from '@/lib/shared/supabase/service'

import {
  createPurchaseRequest,
} from '@/lib/procurement/services/createPurchaseRequest'

const supabase = getServiceSupabase()

export async function checkLowStock({
  tenantId,
  itemId,
}) {

  if (!tenantId || !itemId) {

    throw new Error(
      'tenantId and itemId required'
    )
  }

  const {
    data: ingredient,
    error,
  } = await supabase
    .from('inventory_items')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      itemId
    )
    .single()

  if (error || !ingredient) {

    throw new Error(
      'Ingredient not found'
    )
  }

  const quantity =
    Number(
      ingredient.quantity || 0
    )

  const threshold =
    Number(
      ingredient.reorder_level ||
      ingredient.min_quantity ||
      5
    )

  if (quantity > threshold) {

    return {

      lowStock: false,

      ingredient,

    }
  }

  const alert = {

    tenant_id:
      tenantId,

    module:
      'inventory',

    alert_type:
      'LOW_STOCK',

    severity:
      quantity <= 0
        ? 'critical'
        : 'warning',

    reference_id:
      itemId,

    title:
      'Low stock detected',

    message:
      `${ingredient.name || 'Ingredient'} is at ${quantity}, threshold ${threshold}`,

    status:
      'open',

    created_at:
      new Date().toISOString(),

  }

  await supabase
    .from('operational_alerts')
    .insert(alert)

  const purchaseRequest =
    await createPurchaseRequest({

      tenantId,

      ingredient,

    })

  return {

    lowStock: true,

    ingredient,

    alert,

    purchaseRequest,

  }
}
