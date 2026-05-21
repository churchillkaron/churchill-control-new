import { supabaseAdmin }
from '@/lib/shared/supabase/admin'

export async function
createVIPCustomerEvent({

  tenantId,

  customerId,

  orderId,

  total,

}) {

  console.log(
    '[VIP_RUNTIME]',
    customerId
  )

  const {
    data,
    error,
  } = await supabaseAdmin
    .from(
      'customer_intelligence_events'
    )
    .insert({

      tenant_id:
        tenantId,

      customer_id:
        customerId,

      order_id:
        orderId,

      event_type:
        'HIGH_VALUE_ORDER',

      total,

    })
    .select()
    .single()

  if (error) {

    console.error(
      '[VIP_EVENT_ERROR]',
      error
    )

    return null
  }

  return data

}
