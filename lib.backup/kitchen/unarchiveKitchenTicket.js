import { supabase } from '@/lib/shared/supabase/client'

export async function unarchiveKitchenTicket({
  tenantId,
  kitchenTicketId,
  restoredBy = 'MANAGER',
  reason = 'Restore archived kitchen ticket',
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
    !ticket.archived
  ) {

    throw new Error(
      'Kitchen ticket is not archived'
    )
  }

  /*
  |--------------------------------------------------------------------------
  | Restore Kitchen Queue
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_queue')
    .update({

      archived:
        false,

      restored_by:
        restoredBy,

      restore_reason:
        reason,

      restored_at:
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
  | Restore Kitchen Ticket
  |--------------------------------------------------------------------------
  */

  await supabase
    .from('kitchen_tickets')
    .update({

      archived:
        false,

      restored_by:
        restoredBy,

      restore_reason:
        reason,

      restored_at:
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
        'UNARCHIVE_KITCHEN_TICKET',

      reference_id:
        kitchenTicketId,

      metadata: {

        order_id:
          ticket.order_id,

        table_number:
          ticket.table_number,

        restored_by:
          restoredBy,

        reason,

      },

      created_at:
        new Date().toISOString(),

    })

  return {

    success: true,

    kitchenTicketId,

    archived:
      false,

  }
}
