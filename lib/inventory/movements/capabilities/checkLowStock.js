import { getServiceSupabase } from '@/lib/shared/supabase/service'

import {
  createPurchaseRequest,
} from '@/lib/procurement/services/createPurchaseRequest'

const supabase = getServiceSupabase()

export async function checkLowStock({
  organizationId,
  itemId,
}) {

  if (!organizationId || !itemId) {

    throw new Error(
      'organizationId and itemId required'
    )
  }

  const {
    data: ingredient,
    error,
  } = await supabase
    .from('inventory_items')
    .select('*')
    .eq(
      'organization_id',
      organizationId
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

    organization_id:
      organizationId,

    entity_id:
      ingredient.entity_id ||
      null,

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

      organizationId,

      entityId:
        ingredient.entity_id ||
        null,

      ingredient,

    })

  return {

    lowStock: true,

    ingredient,

    alert,

    purchaseRequest,

  }
}
