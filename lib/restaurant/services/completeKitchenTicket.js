import { createClient } from '@supabase/supabase-js'

import {
  completeOrder,
} from './completeOrder'

const supabase =
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

export async function completeKitchenTicket({
  tenantId,
  ticketId,
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  if (!ticketId) {
    throw new Error('ticketId required')
  }

  const {
    data: ticket,
    error: ticketError,
  } = await supabase
    .from('kitchen_tickets')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', ticketId)
    .single()

  if (ticketError || !ticket) {
    throw new Error('Kitchen ticket not found')
  }

  const {
    error: updateError,
  } = await supabase
    .from('kitchen_tickets')
    .update({

      status:
        'COMPLETED',

      completed_at:
        new Date().toISOString(),

    })
    .eq('tenant_id', tenantId)
    .eq('id', ticketId)

  if (updateError) {
    throw new Error(updateError.message)
  }

  const orderResult =
    await completeOrder({

      tenantId,

      orderId:
        ticket.order_id,

    })

  return {

    success: true,

    kitchenTicketId:
      ticketId,

    order:
      orderResult,

  }
}
