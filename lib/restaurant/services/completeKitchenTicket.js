import { getServiceSupabase } from '@/lib/shared/supabase/service'

import {
  completeOrder,
} from './completeOrder'

import {
  getActiveTableSession,
} from './getActiveTableSession'

const supabase = getServiceSupabase()

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
    throw new Error(
      'Kitchen ticket not found'
    )
  }

  const {
    error: ticketUpdateError,
  } = await supabase
    .from('kitchen_tickets')
    .update({

      status:
        'COMPLETED',

      completed_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      ticketId
    )

  if (ticketUpdateError) {
    throw new Error(
      ticketUpdateError.message
    )
  }

  const orderResult =
    await completeOrder({

      tenantId,

      orderId:
        ticket.order_id,

    })

  const {
    data: pendingTickets,
    error: pendingError,
  } = await supabase
    .from('kitchen_tickets')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'table_number',
      ticket.table_number
    )
    .neq(
      'status',
      'COMPLETED'
    )

  if (pendingError) {
    throw new Error(
      pendingError.message
    )
  }

  if (
    !pendingTickets ||
    pendingTickets.length === 0
  ) {

    const session =
      await getActiveTableSession({

        tenantId,

        tableNumber:
          ticket.table_number,

      })

    if (session) {

      const {
        error: sessionError,
      } = await supabase
        .from('table_sessions')
        .update({

          status:
            'READY_FOR_PAYMENT',

          updated_at:
            new Date().toISOString(),

        })
        .eq(
          'tenant_id',
          tenantId
        )
        .eq(
          'id',
          session.id
        )

      if (sessionError) {
        throw new Error(
          sessionError.message
        )
      }
    }
  }

  return {

    success: true,

    kitchenTicketId:
      ticketId,

    order:
      orderResult,

  }
}
