import { supabase } from '@/lib/shared/supabase/client'

export async function voidKitchenTicket({
  tenantId,
  kitchenTicketId,
  voidedBy = 'MANAGER',
  reason = 'Void kitchen ticket',
}) {

  if (!tenantId) {
    throw new Error('tenantId required')
  }

  if (!kitchenTicketId) {
    throw new Error('kitchenTicketId required')
  }

  const {
    data: ticket,
    error: ticketError,
  } = await supabase
    .from('kitchen_tickets')
    .select('*')
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      kitchenTicketId
    )
    .single()

  if (
    ticketError ||
    !ticket
  ) {

    throw new Error(
      'Kitchen ticket not found'
    )
  }

  if (
    [
      'VOIDED',
      'BUMPED',
    ].includes(
      ticket.status
    )
  ) {

    throw new Error(
      'Kitchen ticket already finalized'
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Void Kitchen Queue
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_queue')
    .update({

      status:
        'VOIDED',

      voided_by:
        voidedBy,

      void_reason:
        reason,

      voided_at:
        new Date().toISOString(),

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'kitchen_ticket_id',
      kitchenTicketId
    )

  /*
  |--------------------------------------------------------------------------
  | Void Kitchen Ticket
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_tickets')
    .update({

      status:
        'VOIDED',

      voided_by:
        voidedBy,

      void_reason:
        reason,

      voided_at:
        new Date().toISOString(),

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      kitchenTicketId
    )

  /*
  |--------------------------------------------------------------------------
  | Void Order
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('orders')
    .update({

      status:
        'VOIDED',

      kitchen_status:
        'VOIDED',

      production_status:
        'VOIDED',

      updated_at:
        new Date().toISOString(),

    })
    .eq(
      'tenant_id',
      tenantId
    )
    .eq(
      'id',
      ticket.order_id
    )

  /*
  |--------------------------------------------------------------------------
  | Audit
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('audit_logs')
    .insert({

      tenant_id:
        tenantId,

      module:
        'kitchen',

      action:
        'VOID_KITCHEN_TICKET',

      reference_id:
        kitchenTicketId,

      metadata: {

        order_id:
          ticket.order_id,

        table_number:
          ticket.table_number,

        voided_by:
          voidedBy,

        reason,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    kitchenTicketId,

    status:
      'VOIDED',

  }
}
