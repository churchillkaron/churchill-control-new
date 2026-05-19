import { createClient } from '@supabase/supabase-js'

import {
  createPurchaseRequest,
} from '@/lib/procurement/services/createPurchaseRequest'

const supabase =
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

export async function checkLowStock({
  tenantId,
  ingredientId,
}) {

  if (!tenantId || !ingredientId) {

    throw new Error(
      'tenantId and ingredientId required'
    )
  }

  const {
    data: ingredient,
    error,
  } = await supabase
    .from('ingredients')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      ingredientId
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
      ingredientId,

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
