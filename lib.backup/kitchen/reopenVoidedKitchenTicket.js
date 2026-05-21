import { supabase } from '@/lib/shared/supabase/client'

export async function reopenVoidedKitchenTicket({
  tenantId,
  kitchenTicketId,
  reopenedBy = 'MANAGER',
  reason = 'Reopen voided ticket',
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
    ticket.status !==
    'VOIDED'
  ) {

    throw new Error(
      'Only VOIDED tickets can be reopened'
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Reopen Kitchen Queue
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_queue')
    .update({

      status:
        'WAITING',

      reopened_by:
        reopenedBy,

      reopen_reason:
        reason,

      reopened_at:
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
  | Reopen Kitchen Ticket
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_tickets')
    .update({

      status:
        'WAITING',

      reopened_by:
        reopenedBy,

      reopen_reason:
        reason,

      reopened_at:
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
  | Reopen Order
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('orders')
    .update({

      status:
        'OPEN',

      kitchen_status:
        'WAITING',

      production_status:
        'PENDING',

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
        'REOPEN_VOIDED_KITCHEN_TICKET',

      reference_id:
        kitchenTicketId,

      metadata: {

        order_id:
          ticket.order_id,

        table_number:
          ticket.table_number,

        reopened_by:
          reopenedBy,

        reason,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    kitchenTicketId,

    status:
      'WAITING',

  }
}
