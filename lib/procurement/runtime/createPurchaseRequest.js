import { supabaseAdmin }
from '@/lib/shared/supabase/admin'

export async function
createPurchaseRequest({

  tenantId,

  ingredientId,

  ingredientName,

  currentStock,

}) {

  console.log(
    '[PROCUREMENT_RUNTIME]',
    ingredientName
  )

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(
      'purchase_requests'
    )
    .insert({

      tenant_id:
        tenantId,

      ingredient_id:
        ingredientId,

      ingredient_name:
        ingredientName,

      current_stock:
        currentStock,

      status:
        'PENDING',

    })
    .select()
    .single()

  if (error) {

    console.error(
      '[PURCHASE_REQUEST_ERROR]',
      error
    )

    return null
  }

  return data

}
