import { supabaseAdmin }
from '@/lib/shared/supabase/admin'

export async function
createPurchaseOrder({

  tenantId,

  approval,

}) {

  console.log(
    '[PURCHASE_ORDER_RUNTIME]'
  )

  const request =
    approval?.payload
      ?.purchaseRequest

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(
      'purchase_orders'
    )
    .insert({

      tenant_id:
        tenantId,

      purchase_request_id:
        request?.id,

      status:
        'PENDING_VENDOR',

      total_amount:
        0,

      payload:
        approval,

    })
    .select()
    .single()

  if (error) {

    console.error(
      '[PURCHASE_ORDER_ERROR]',
      error
    )

    return null

  }

  return data

}
